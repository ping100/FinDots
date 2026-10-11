-- «Здоровье» в Todots: напоминания пить воду (со счётчиком стаканов) и
-- ложиться спать (заранее и в само время отбоя). Устроено как напоминания
-- задач и платежей: «кто на очереди» — закрытая функция; «забрать и
-- отметить» — по секрету из Vault; pg_cron зовёт /api/reminders, только
-- когда есть кого.

create table public.wellness_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  water_on boolean not null default false,
  water_from time not null default '09:00',
  water_to time not null default '21:00',
  water_every_min int not null default 120 check (water_every_min between 30 and 480),
  water_goal int not null default 8 check (water_goal between 1 and 30),
  -- Когда последний раз напомнили или человек сам отметил стакан.
  water_reminded_at timestamptz,
  sleep_on boolean not null default false,
  sleep_at time not null default '23:00',
  -- ISO: 1 — понедельник … 7 — воскресенье.
  sleep_days int[] not null default '{1,2,3,4,5,6,7}',
  sleep_prep_min int not null default 30 check (sleep_prep_min between 0 and 180),
  -- Для какого отбоя (местное время) уже отправили — чтобы не повторять.
  sleep_prep_reminded_for timestamp,
  sleep_reminded_for timestamp
);

create table public.water_log (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  glasses int not null default 0 check (glasses between 0 and 50),
  primary key (user_id, day)
);

alter table public.wellness_settings enable row level security;
alter table public.water_log enable row level security;

create policy "wellness: own" on public.wellness_settings for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "water log: own" on public.water_log for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.wellness_settings, public.water_log from anon;
grant select, insert, update, delete on public.wellness_settings, public.water_log to authenticated;

-- p_now — только чтобы проверять логику на любой момент времени.
create function public.due_wellness_reminders(p_now timestamptz default now())
returns table(user_id uuid, kind text, mark timestamp, glasses int, goal int, prep_min int)
language sql stable security definer set search_path to ''
as $$
  with w as (
    select ws.*,
           (p_now at time zone coalesce(p.time_zone, 'Asia/Almaty')) as local_now
      from public.wellness_settings ws
      join public.profiles p on p.id = ws.user_id
     where (ws.water_on or ws.sleep_on)
       and exists (select 1 from public.push_subscriptions s where s.user_id = ws.user_id)
  ),
  water as (
    select w.user_id, w.local_now, w.water_goal,
           coalesce((select l.glasses from public.water_log l
                      where l.user_id = w.user_id and l.day = w.local_now::date), 0) as glasses
      from w
     where w.water_on
       and w.local_now::time between w.water_from and w.water_to
       and (w.water_reminded_at is null
            or w.water_reminded_at <= p_now - make_interval(mins => w.water_every_min - 2))
  ),
  -- Ближайший отбой: сегодняшний, а если он прошёл больше получаса назад — завтрашний.
  sleep as (
    select w.user_id, w.local_now, w.sleep_days, w.sleep_prep_min,
           w.sleep_prep_reminded_for, w.sleep_reminded_for,
           case when (w.local_now::date + w.sleep_at) < w.local_now - interval '30 minutes'
                then (w.local_now::date + 1) + w.sleep_at
                else w.local_now::date + w.sleep_at end as target
      from w
     where w.sleep_on
  )
  select water.user_id, 'water'::text, water.local_now, water.glasses, water.water_goal, 0
    from water
   where water.glasses < water.water_goal
  union all
  select sleep.user_id, 'sleep_prep'::text, sleep.target, 0, 0, sleep.sleep_prep_min
    from sleep
   where sleep.sleep_prep_min > 0
     and extract(isodow from sleep.target)::int = any (sleep.sleep_days)
     and sleep.local_now >= sleep.target - make_interval(mins => sleep.sleep_prep_min)
     and sleep.local_now < sleep.target
     and sleep.sleep_prep_reminded_for is distinct from sleep.target
  union all
  select sleep.user_id, 'sleep'::text, sleep.target, 0, 0, 0
    from sleep
   where extract(isodow from sleep.target)::int = any (sleep.sleep_days)
     and sleep.local_now >= sleep.target
     and sleep.local_now < sleep.target + interval '30 minutes'
     and sleep.sleep_reminded_for is distinct from sleep.target;
$$;

revoke all on function public.due_wellness_reminders(timestamptz) from public, anon, authenticated;

create function public.claim_due_wellness_reminders(p_secret text)
returns table(endpoint text, p256dh text, auth text, kind text, glasses int, goal int, prep_min int)
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

  for r in select * from public.due_wellness_reminders() loop
    if r.kind = 'water' then
      update public.wellness_settings ws set water_reminded_at = now()
       where ws.user_id = r.user_id
         and (ws.water_reminded_at is null
              or ws.water_reminded_at <= now() - make_interval(mins => ws.water_every_min - 2));
    elsif r.kind = 'sleep_prep' then
      update public.wellness_settings ws set sleep_prep_reminded_for = r.mark
       where ws.user_id = r.user_id and ws.sleep_prep_reminded_for is distinct from r.mark;
    else
      update public.wellness_settings ws set sleep_reminded_for = r.mark
       where ws.user_id = r.user_id and ws.sleep_reminded_for is distinct from r.mark;
    end if;
    -- Уже забрал параллельный вызов — второй раз не шлём.
    if not found then
      continue;
    end if;
    return query
      select s.endpoint, s.p256dh, s.auth, r.kind::text, r.glasses::int, r.goal::int, r.prep_min::int
        from public.push_subscriptions s
       where s.user_id = r.user_id;
  end loop;
end;
$$;

create function public.kick_wellness_reminders()
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if exists (select 1 from public.due_wellness_reminders()) then
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

revoke all on function public.kick_wellness_reminders() from public, anon, authenticated;

select cron.schedule('wellness-reminders', '*/5 * * * *', 'select public.kick_wellness_reminders()');
