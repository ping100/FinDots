-- Напоминания о регулярных платежах («Каждый месяц»): пуш за два дня до
-- числа платежа и до самого дня, с 10:00 по времени человека, пока платёж
-- не оплачен. Устроено как напоминания задач (0018…): «кто на очереди» —
-- функция, закрытая от клиентов; «забрать и отметить» — по секрету из
-- Vault; будильник pg_cron зовёт /api/reminders, только когда есть кого.

-- За какую дату платежа уже отправили напоминание — чтобы не повторять.
alter table public.categories add column reminded_for date;

-- p_now — только чтобы проверять логику на любой момент времени.
create function public.due_bill_reminders(p_now timestamptz default now())
returns table(category_id uuid, user_id uuid, name text, amount numeric, currency text, due date, days_left int)
language sql stable security definer set search_path to ''
as $$
  with b as (
    select c.id, c.user_id, c.name, c.planned_amount, c.due_day, c.paid_month, c.reminded_for,
           p.base_currency,
           coalesce(p.time_zone, 'Asia/Almaty') as tz,
           (p_now at time zone coalesce(p.time_zone, 'Asia/Almaty')) as local_now
      from public.categories c
      join public.profiles p on p.id = c.user_id
     where c.kind = 'expense' and not c.archived and c.parent_id is null
       and c.planned_amount is not null and c.due_day is not null
       and coalesce(p.access_money, true)
       and exists (select 1 from public.push_subscriptions s where s.user_id = c.user_id)
  ), d as (
    select b.*,
           date_trunc('month', b.local_now)::date as month_start,
           date_trunc('month', b.local_now)::date
             + (least(b.due_day,
                      extract(day from date_trunc('month', b.local_now) + interval '1 month - 1 day')::int) - 1)
             as due_date
      from b
  ), s as (
    select d.*,
           coalesce((
             select sum(public.convert_amount(d.user_id, t.amount, t.currency, d.base_currency))
               from public.transactions t
              where t.user_id = d.user_id and t.category_id = d.id and t.type = 'expense'
                and t.occurred_at >= (d.month_start::timestamp at time zone d.tz)
                and t.occurred_at <  ((d.month_start + interval '1 month')::timestamp at time zone d.tz)
           ), 0) as spent
      from d
  )
  select s.id, s.user_id, s.name, s.planned_amount - s.spent, s.base_currency, s.due_date,
         (s.due_date - s.local_now::date)
    from s
   where s.local_now::date between s.due_date - 2 and s.due_date
     and s.local_now::time >= time '10:00'
     and s.paid_month is distinct from s.month_start
     and s.planned_amount - s.spent > 0.5
     and s.reminded_for is distinct from s.due_date;
$$;

revoke all on function public.due_bill_reminders(timestamptz) from public, anon, authenticated;

create function public.claim_due_bill_reminders(p_secret text)
returns table(endpoint text, p256dh text, auth text, category_id uuid, name text, amount numeric, currency text, due date, days_left int)
language plpgsql security definer set search_path to ''
as $$
#variable_conflict use_column
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret') then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return query
  with x as (select * from public.due_bill_reminders()),
  claimed as (
    update public.categories c set reminded_for = x.due
      from x
     where c.id = x.category_id and c.reminded_for is distinct from x.due
    returning c.id, c.user_id, x.name, x.amount, x.currency, x.due, x.days_left
  )
  select s.endpoint, s.p256dh, s.auth, cl.id, cl.name, cl.amount, cl.currency, cl.due, cl.days_left
    from claimed cl
    join public.push_subscriptions s on s.user_id = cl.user_id;
end;
$$;

create function public.kick_bill_reminders()
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if exists (select 1 from public.due_bill_reminders()) then
    perform net.http_post(
      url := 'https://dotsapp.vercel.app/api/reminders',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-reminders-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  end if;
end;
$$;

revoke all on function public.kick_bill_reminders() from public, anon, authenticated;

select cron.schedule('bill-reminders', '*/10 * * * *', 'select public.kick_bill_reminders()');
