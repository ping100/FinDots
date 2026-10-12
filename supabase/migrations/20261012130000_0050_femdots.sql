-- FemDots — календарь цикла. Третье приложение Dots на том же входе.
--
-- Данные о здоровье: видит только сама пользовательница (RLS «own»), ни
-- одной политики для админа здесь нет — админка FemDots не читает.

-- Какие приложения показывать на развилке (шестерёнка на главной).
alter table public.profiles add column apps_enabled text[] not null default '{money,tasks}'
  check (apps_enabled <@ array['money', 'tasks', 'fem']::text[] and cardinality(apps_enabled) >= 1);

create table public.fem_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  -- Согласие на обработку данных о здоровье — при первом входе.
  consent_at timestamptz not null default now(),
  cycle_length int not null default 28 check (cycle_length between 15 and 60),
  period_length int not null default 5 check (period_length between 1 and 15),
  remind_period boolean not null default true,
  remind_fertile boolean not null default false,
  pill_on boolean not null default false,
  pill_at time not null default '21:00',
  -- Скрытые уведомления: на экране блокировки без подробностей.
  discreet boolean not null default false,
  period_reminded_for date,
  fertile_reminded_for date,
  pill_reminded_for date
);

create table public.fem_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  start_date date not null,
  -- Пусто — месячные ещё идут.
  end_date date,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  unique (user_id, start_date)
);
create index fem_periods_user_start on public.fem_periods (user_id, start_date desc);

create table public.fem_days (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  flow text check (flow in ('spotting', 'light', 'medium', 'heavy')),
  symptoms text[] not null default '{}',
  mood text,
  note text check (char_length(note) <= 1000),
  primary key (user_id, day)
);

alter table public.fem_settings enable row level security;
alter table public.fem_periods enable row level security;
alter table public.fem_days enable row level security;

create policy "fem settings: own" on public.fem_settings for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "fem periods: own" on public.fem_periods for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "fem days: own" on public.fem_days for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.fem_settings, public.fem_periods, public.fem_days from anon;
grant select, insert, update, delete on public.fem_settings, public.fem_periods, public.fem_days to authenticated;

-- ───────────────────────────── напоминания ─────────────────────────────
-- Средний цикл — по последним шести промежуткам между началами (15–60
-- дней, остальное — пропущенная отметка), иначе — из настроек. Ровно так
-- же считает приложение (src/lib/fem/cycle.ts).
create function public.due_fem_reminders(p_now timestamptz default now())
returns table(user_id uuid, kind text, mark date, days_left int, until_day date, discreet boolean)
language sql stable security definer set search_path to ''
as $$
  with s as (
    select fs.*, (p_now at time zone coalesce(p.time_zone, 'Asia/Almaty')) as local_now
      from public.fem_settings fs
      join public.profiles p on p.id = fs.user_id
     where 'fem' = any (p.apps_enabled)
       and exists (select 1 from public.push_subscriptions x where x.user_id = fs.user_id)
  ),
  gaps as (
    select fp.user_id, fp.start_date - lag(fp.start_date) over (partition by fp.user_id order by fp.start_date) as gap,
           row_number() over (partition by fp.user_id order by fp.start_date desc) as rn
      from public.fem_periods fp
  ),
  avg_gap as (
    select g.user_id, round(avg(g.gap))::int as cycle
      from gaps g
     where g.gap between 15 and 60 and g.rn <= 7
     group by g.user_id
  ),
  c as (
    select s.*, coalesce(a.cycle, s.cycle_length) as cycle,
           (select max(fp.start_date) from public.fem_periods fp where fp.user_id = s.user_id) as last_start
      from s left join avg_gap a on a.user_id = s.user_id
  ),
  n as (
    select c.*, c.last_start + c.cycle as next_start
      from c where c.last_start is not null
  )
  select n.user_id, 'period'::text, n.next_start, (n.next_start - n.local_now::date)::int, null::date, n.discreet
    from n
   where n.remind_period
     and n.local_now::date between n.next_start - 2 and n.next_start
     and n.local_now::time >= time '10:00'
     and n.period_reminded_for is distinct from n.next_start
  union all
  select n.user_id, 'fertile'::text, n.next_start - 19, 0, n.next_start - 13, n.discreet
    from n
   where n.remind_fertile
     and n.local_now::date between n.next_start - 19 and n.next_start - 14
     and n.local_now::time >= time '10:00'
     and n.fertile_reminded_for is distinct from n.next_start - 19
  union all
  select s.user_id, 'pill'::text, s.local_now::date, 0, null::date, s.discreet
    from s
   where s.pill_on
     and s.local_now::time >= s.pill_at
     and s.local_now::time < s.pill_at + interval '2 hours'
     and s.pill_reminded_for is distinct from s.local_now::date;
$$;

revoke all on function public.due_fem_reminders(timestamptz) from public, anon, authenticated;

create function public.claim_due_fem_reminders(p_secret text)
returns table(endpoint text, p256dh text, auth text, kind text, mark date, days_left int, until_day date, discreet boolean)
language plpgsql security definer set search_path to ''
as $$
#variable_conflict use_column
declare
  r record;
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret') then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  for r in select * from public.due_fem_reminders() loop
    if r.kind = 'period' then
      update public.fem_settings fs set period_reminded_for = r.mark
       where fs.user_id = r.user_id and fs.period_reminded_for is distinct from r.mark;
    elsif r.kind = 'fertile' then
      update public.fem_settings fs set fertile_reminded_for = r.mark
       where fs.user_id = r.user_id and fs.fertile_reminded_for is distinct from r.mark;
    else
      update public.fem_settings fs set pill_reminded_for = r.mark
       where fs.user_id = r.user_id and fs.pill_reminded_for is distinct from r.mark;
    end if;
    -- Уже забрал параллельный вызов — второй раз не шлём.
    if not found then
      continue;
    end if;
    return query
      select x.endpoint, x.p256dh, x.auth, r.kind::text, r.mark, r.days_left, r.until_day, r.discreet
        from public.push_subscriptions x
       where x.user_id = r.user_id;
  end loop;
end;
$$;

create function public.kick_fem_reminders()
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if exists (select 1 from public.due_fem_reminders()) then
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

revoke all on function public.kick_fem_reminders() from public, anon, authenticated;

select cron.schedule('fem-reminders', '*/10 * * * *', 'select public.kick_fem_reminders()');
