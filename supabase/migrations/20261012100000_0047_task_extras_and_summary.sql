-- Todots: повторы, чек-лист к задаче и утренняя сводка пушем.

-- Повтор: выполнили — создаётся следующая задача на ближайший подходящий
-- день. repeat_days — дни недели ISO (1 — пн … 7 — вс) для 'weekly'.
-- repeat_parent — из какой задачи создана: отмена выполнения удаляет её.
alter table public.tasks
  add column repeat text check (repeat in ('daily', 'weekdays', 'weekly', 'monthly', 'yearly')),
  add column repeat_days int[],
  add column repeat_parent uuid references public.tasks(id) on delete set null,
  -- Пункты: [{ "id": "…", "text": "Молоко", "done": false }, …]
  add column checklist jsonb not null default '[]'::jsonb
    check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 50);

create index tasks_repeat_parent_idx on public.tasks (repeat_parent) where repeat_parent is not null;

-- Утренняя сводка: «Сегодня 5 задач, первая в 10:00 — …». Настройки — в
-- той же строке, что вода и сон: это всё настройки Todots на человека.
alter table public.wellness_settings
  add column summary_on boolean not null default false,
  add column summary_at time not null default '08:00',
  add column summary_sent_for date;

-- p_now — только чтобы проверять логику на любой момент времени.
create function public.due_task_summaries(p_now timestamptz default now())
returns table(user_id uuid, day date, total int, overdue int, first_title text, first_time time)
language sql stable security definer set search_path to ''
as $$
  with w as (
    select ws.user_id, ws.summary_at, ws.summary_sent_for,
           (p_now at time zone coalesce(p.time_zone, 'Asia/Almaty')) as local_now
      from public.wellness_settings ws
      join public.profiles p on p.id = ws.user_id
     where ws.summary_on
       and exists (select 1 from public.push_subscriptions s where s.user_id = ws.user_id)
  )
  select w.user_id, w.local_now::date,
         (select count(*)::int from public.tasks t
           where t.user_id = w.user_id and t.date = w.local_now::date and not t.done),
         (select count(*)::int from public.tasks t
           where t.user_id = w.user_id and t.date < w.local_now::date and not t.done and not t.carry_over),
         f.title, f.time
    from w
    left join lateral (
      select t.title, t.time from public.tasks t
       where t.user_id = w.user_id and t.date = w.local_now::date and not t.done and t.time is not null
       order by t.time limit 1
    ) f on true
   -- Час на отправку: если будильник пропустил минуту, сводка всё равно придёт.
   where w.local_now::time >= w.summary_at
     and w.local_now::time < w.summary_at + interval '1 hour'
     and w.summary_sent_for is distinct from w.local_now::date;
$$;

revoke all on function public.due_task_summaries(timestamptz) from public, anon, authenticated;

create function public.claim_due_task_summaries(p_secret text)
returns table(endpoint text, p256dh text, auth text, total int, overdue int, first_title text, first_time time)
language plpgsql security definer set search_path to ''
as $$
#variable_conflict use_column
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret') then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return query
  with x as (select * from public.due_task_summaries()),
  claimed as (
    update public.wellness_settings ws set summary_sent_for = x.day
      from x
     where ws.user_id = x.user_id and ws.summary_sent_for is distinct from x.day
    returning ws.user_id, x.total, x.overdue, x.first_title, x.first_time
  )
  select s.endpoint, s.p256dh, s.auth, c.total, c.overdue, c.first_title, c.first_time
    from claimed c
    join public.push_subscriptions s on s.user_id = c.user_id;
end;
$$;

create function public.kick_task_summaries()
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if exists (select 1 from public.due_task_summaries()) then
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

revoke all on function public.kick_task_summaries() from public, anon, authenticated;

select cron.schedule('task-summaries', '*/5 * * * *', 'select public.kick_task_summaries()');
