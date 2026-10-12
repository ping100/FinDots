-- FemDots: контрацепция и препараты, тесты на овуляцию и базальная
-- температура, цель (слежу / планируем / избегаем), статус дня и сигналы
-- между партнёрами («нужна забота», «купи…», «думаю о тебе»).

-- ───────────────────────────── данные ─────────────────────────────
alter table public.fem_settings
  add column goal text not null default 'track' check (goal in ('track', 'conceive', 'avoid')),
  -- Метод контрацепции. Гормональные (всё, кроме none и iud_copper)
  -- подавляют овуляцию — фертильное окно не показываем.
  add column method text not null default 'none'
    check (method in ('none', 'coc', 'pop', 'iud_hormonal', 'iud_copper', 'implant', 'injection', 'ring', 'patch')),
  -- Начало текущей упаковки / кольца / пластыря, дата укола или установки.
  add column method_start date,
  -- Схема упаковки: дней с гормоном и дней перерыва (21+7, 24+4, 28+0).
  add column pack_active int not null default 21 check (pack_active between 1 and 365),
  add column pack_break int not null default 7 check (pack_break between 0 and 7),
  add column method_reminded_for date;

alter table public.fem_days
  -- Тест на овуляцию (ЛГ): положительный — овуляция через 24–36 ч.
  add column lh text check (lh in ('neg', 'pos')),
  -- Базальная температура утром, °C.
  add column temp numeric(4, 2) check (temp between 34 and 39),
  -- Препараты, влияющие на цикл: ec — экстренная контрацепция,
  -- stim — стимуляция овуляции, hormones — другие гормоны.
  add column meds text[] not null default '{}',
  -- Таблетка за этот день выпита.
  add column pill boolean,
  -- Статус дня для партнёра: ключ смайлика.
  add column status text check (char_length(status) <= 40);

alter table public.fem_shares
  add column share_status boolean not null default true,
  -- Показывать партнёру режим «Планируем беременность».
  add column share_goal boolean not null default false,
  -- Если таблетка не отмечена через 2 часа — напомнить партнёру.
  add column pill_nudge boolean not null default false,
  add column pill_nudged_for date;

-- ───────────────────────────── сигналы ─────────────────────────────
create table public.fem_signals (
  id bigint generated always as identity primary key,
  from_id uuid not null references auth.users(id) on delete cascade,
  to_id uuid not null references auth.users(id) on delete cascade,
  -- care — нужна забота, buy — купи по дороге (item — что), alone — хочу
  -- побыть одна, heart — думаю о тебе, ok — уже бегу.
  kind text not null check (kind in ('care', 'buy', 'alone', 'heart', 'ok')),
  item text check (char_length(item) <= 40),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index fem_signals_to on public.fem_signals (to_id, created_at desc);
create index fem_signals_from on public.fem_signals (from_id, created_at desc);

alter table public.fem_signals enable row level security;
create policy "fem signals: mine" on public.fem_signals for select
  using (from_id = (select auth.uid()) or to_id = (select auth.uid()));
revoke all on public.fem_signals from anon, authenticated;
grant select on public.fem_signals to authenticated;

-- Отправить сигнал второму в паре: владелица — партнёру, партнёр — ей.
create function public.fem_signal_send(p_kind text, p_item text default null)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  v_to uuid;
begin
  if auth.uid() is null then raise exception 'Нет входа' using errcode = '42501'; end if;
  select coalesce(
    (select partner_id from public.fem_shares where owner_id = auth.uid() and active and partner_id is not null),
    (select owner_id from public.fem_shares where partner_id = auth.uid() and active)
  ) into v_to;
  if v_to is null then raise exception 'Партнёр не подключён'; end if;
  if (select count(*) from public.fem_signals
       where from_id = auth.uid() and created_at > now() - interval '1 day') >= 40 then
    raise exception 'Слишком много за сутки — попробуйте завтра';
  end if;
  insert into public.fem_signals (from_id, to_id, kind, item)
  values (auth.uid(), v_to, p_kind, nullif(trim(p_item), ''));
end;
$$;

create function public.fem_signals_seen()
returns void
language sql security definer set search_path to ''
as $$
  update public.fem_signals set seen_at = now() where to_id = auth.uid() and seen_at is null;
$$;

-- Новый сигнал — сразу пуш получателю (как ответ поддержки).
create function public.fem_signal_notify()
returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  if exists (select 1 from public.push_subscriptions where user_id = new.to_id) then
    perform net.http_post(
      url := 'https://dotsapp.vercel.app/api/fem-signal',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-reminders-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret')
      ),
      body := jsonb_build_object('signal_id', new.id),
      timeout_milliseconds := 10000
    );
  end if;
  return new;
end;
$$;
create trigger fem_signal_notify after insert on public.fem_signals
  for each row execute function public.fem_signal_notify();

create function public.fem_signal_push_targets(p_secret text, p_id bigint)
returns table(endpoint text, p256dh text, auth text, kind text, item text, from_name text, discreet boolean)
language plpgsql security definer set search_path to ''
as $$
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret') then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return query
    select x.endpoint, x.p256dh, x.auth, g.kind, g.item,
           coalesce(nullif(trim(p.display_name), ''), 'Партнёр'),
           coalesce((select fs.discreet from public.fem_settings fs where fs.user_id = g.to_id), false)
      from public.fem_signals g
      join public.profiles p on p.id = g.from_id
      join public.push_subscriptions x on x.user_id = g.to_id
     where g.id = p_id;
end;
$$;

-- Настройки приглашения сверх настроения и самочувствия.
create function public.fem_share_settings()
returns jsonb
language sql stable security definer set search_path to ''
as $$
  select jsonb_build_object('share_status', s.share_status, 'share_goal', s.share_goal, 'pill_nudge', s.pill_nudge)
    from public.fem_shares s where s.owner_id = auth.uid() and s.active;
$$;

create function public.fem_share_options(p_status boolean, p_goal boolean, p_pill boolean)
returns void
language sql security definer set search_path to ''
as $$
  update public.fem_shares set share_status = p_status, share_goal = p_goal, pill_nudge = p_pill
   where owner_id = auth.uid();
$$;

revoke all on function public.fem_signal_send(text, text), public.fem_signals_seen(),
  public.fem_share_settings(), public.fem_share_options(boolean, boolean, boolean) from public, anon;
grant execute on function public.fem_signal_send(text, text), public.fem_signals_seen(),
  public.fem_share_settings(), public.fem_share_options(boolean, boolean, boolean) to authenticated;
revoke all on function public.fem_signal_notify(), public.fem_signal_push_targets(text, bigint) from public, anon, authenticated;
grant execute on function public.fem_signal_push_targets(text, bigint) to anon;

-- ─────────────────────── что видит партнёр ───────────────────────
-- Плюс: на гормональной ли она контрацепции (тогда без фертильного
-- окна), цель «планируем» — если разрешила, статус дня и даты
-- положительных тестов на овуляцию (для точного прогноза).
create or replace function public.fem_partner_view()
returns jsonb
language sql stable security definer set search_path to ''
as $$
  select jsonb_build_object(
    'owner_name', coalesce(nullif(trim(p.display_name), ''), 'Партнёрша'),
    'cycle_length', coalesce(fs.cycle_length, 28),
    'period_length', coalesce(fs.period_length, 5),
    'remind', s.partner_remind,
    'share_mood', s.share_mood,
    'share_symptoms', s.share_symptoms,
    'share_status', s.share_status,
    'hormonal', coalesce(fs.method not in ('none', 'iud_copper'), false),
    'goal', case when s.share_goal then fs.goal end,
    'pill_nudge', s.pill_nudge,
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object('id', fp.id, 'start_date', fp.start_date, 'end_date', fp.end_date) order by fp.start_date)
        from public.fem_periods fp where fp.user_id = s.owner_id
    ), '[]'::jsonb),
    'lh_days', coalesce((
      select jsonb_agg(d.day order by d.day)
        from public.fem_days d
       where d.user_id = s.owner_id and d.lh = 'pos' and d.day > current_date - 200
    ), '[]'::jsonb),
    'today', (
      select jsonb_build_object(
        'mood', case when s.share_mood then d.mood end,
        'symptoms', case when s.share_symptoms then to_jsonb(d.symptoms) else '[]'::jsonb end,
        'status', case when s.share_status then d.status end
      )
        from public.fem_days d
       where d.user_id = s.owner_id
         and d.day = (now() at time zone coalesce(p.time_zone, 'Asia/Almaty'))::date
    )
  )
    from public.fem_shares s
    join public.profiles p on p.id = s.owner_id
    left join public.fem_settings fs on fs.user_id = s.owner_id
   where s.partner_id = auth.uid() and s.active;
$$;

-- ─────────────────────────── напоминания ───────────────────────────
-- Таблетка — только если ещё не отмечена и не неделя перерыва; на
-- гормональной контрацепции нет фертильного окна и «скоро месячные»;
-- новые: кольцо, пластырь, укол.
create or replace function public.due_fem_reminders(p_now timestamptz default now())
returns table(user_id uuid, kind text, mark date, days_left int, until_day date, discreet boolean)
language sql stable security definer set search_path to ''
as $$
  with s as (
    select fs.*, (p_now at time zone coalesce(p.time_zone, 'Asia/Almaty')) as local_now,
           fs.method not in ('none', 'iud_copper') as hormonal
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
      from c where c.last_start is not null and not c.hormonal
  ),
  m as (
    select s.*, s.local_now::date - s.method_start as d
      from s where s.method_start is not null and s.local_now::date >= s.method_start
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
     and s.pill_reminded_for is distinct from s.local_now::date
     and not exists (select 1 from public.fem_days d where d.user_id = s.user_id and d.day = s.local_now::date and d.pill)
     and not (s.method = 'coc' and s.method_start is not null and s.pack_break > 0
              and (s.local_now::date - s.method_start) % (s.pack_active + s.pack_break) >= s.pack_active)
  union all
  select m.user_id,
         case
           when m.method = 'ring' and m.d % 28 = 21 then 'ring_out'
           when m.method = 'ring' and m.d % 28 = 0 then 'ring_in'
           when m.method = 'patch' and m.d % 28 in (7, 14) then 'patch_change'
           when m.method = 'patch' and m.d % 28 = 21 then 'patch_off'
           when m.method = 'patch' and m.d % 28 = 0 then 'patch_on'
         end,
         m.local_now::date, 0, null::date, m.discreet
    from m
   where m.d > 0
     and ((m.method = 'ring' and m.d % 28 in (0, 21)) or (m.method = 'patch' and m.d % 28 in (0, 7, 14, 21)))
     and m.local_now::time >= time '10:00'
     and m.method_reminded_for is distinct from m.local_now::date
  union all
  select m.user_id, 'injection'::text, m.method_start + 84, (m.method_start + 84 - m.local_now::date)::int, null::date, m.discreet
    from m
   where m.method = 'injection'
     and m.local_now::date between m.method_start + 81 and m.method_start + 91
     and m.local_now::time >= time '10:00'
     and m.method_reminded_for is distinct from m.method_start + 84;
$$;

create or replace function public.claim_due_fem_reminders(p_secret text)
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
    elsif r.kind = 'pill' then
      update public.fem_settings fs set pill_reminded_for = r.mark
       where fs.user_id = r.user_id and fs.pill_reminded_for is distinct from r.mark;
    else
      update public.fem_settings fs set method_reminded_for = r.mark
       where fs.user_id = r.user_id and fs.method_reminded_for is distinct from r.mark;
    end if;
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

-- Партнёру: «напомни ей про таблетку», если через 2 часа после времени
-- приёма она не отмечена (и это разрешено, и сейчас не перерыв).
create function public.due_fem_pill_nudges(p_now timestamptz default now())
returns table(partner_id uuid, owner_name text, mark date)
language sql stable security definer set search_path to ''
as $$
  select sh.partner_id, coalesce(nullif(trim(op.display_name), ''), 'Партнёрша'), (p_now at time zone coalesce(op.time_zone, 'Asia/Almaty'))::date
    from public.fem_shares sh
    join public.fem_settings fs on fs.user_id = sh.owner_id
    join public.profiles op on op.id = sh.owner_id
   where sh.active and sh.partner_id is not null and sh.pill_nudge
     and fs.pill_on and fs.method in ('coc', 'pop')
     and exists (select 1 from public.push_subscriptions x where x.user_id = sh.partner_id)
     and (p_now at time zone coalesce(op.time_zone, 'Asia/Almaty'))::time >= fs.pill_at + interval '2 hours'
     and (p_now at time zone coalesce(op.time_zone, 'Asia/Almaty'))::time < fs.pill_at + interval '4 hours'
     and fs.pill_at < time '20:00'
     and sh.pill_nudged_for is distinct from (p_now at time zone coalesce(op.time_zone, 'Asia/Almaty'))::date
     and not exists (
       select 1 from public.fem_days d
        where d.user_id = sh.owner_id and d.pill
          and d.day = (p_now at time zone coalesce(op.time_zone, 'Asia/Almaty'))::date)
     and not (fs.method = 'coc' and fs.method_start is not null and fs.pack_break > 0
              and ((p_now at time zone coalesce(op.time_zone, 'Asia/Almaty'))::date - fs.method_start)
                  % (fs.pack_active + fs.pack_break) >= fs.pack_active);
$$;
revoke all on function public.due_fem_pill_nudges(timestamptz) from public, anon, authenticated;

create function public.claim_fem_pill_nudges(p_secret text)
returns table(endpoint text, p256dh text, auth text, owner_name text, mark date)
language plpgsql security definer set search_path to ''
as $$
#variable_conflict use_column
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret') then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return query
  with x as (select * from public.due_fem_pill_nudges()),
  claimed as (
    update public.fem_shares sh set pill_nudged_for = x.mark
      from x
     where sh.partner_id = x.partner_id and sh.pill_nudged_for is distinct from x.mark
    returning sh.partner_id, x.owner_name, x.mark
  )
  select s.endpoint, s.p256dh, s.auth, c.owner_name, c.mark
    from claimed c join public.push_subscriptions s on s.user_id = c.partner_id;
end;
$$;

create function public.kick_fem_pill_nudges()
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if exists (select 1 from public.due_fem_pill_nudges()) then
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
revoke all on function public.kick_fem_pill_nudges() from public, anon, authenticated;

select cron.schedule('fem-pill-nudges', '*/10 * * * *', 'select public.kick_fem_pill_nudges()');

-- ─────────────────────────── админка ───────────────────────────
-- Политика обещает: в админке нет ни записей, ни счётчиков FemDots. Из
-- сводки убраны «пользуется FemDots» и число его пользователей (0053).
CREATE OR REPLACE FUNCTION public.admin_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  month_ago timestamptz := now() - interval '30 days';
  week_ago  timestamptz := now() - interval '7 days';
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),

    'users', coalesce((
      select jsonb_agg(row_to_json(u) order by u.created_at desc)
      from (
        select
          au.id,
          un.number,
          au.email,
          p.display_name,
          au.created_at,
          greatest(
            au.last_sign_in_at,
            pr.seen_at,
            (select max(s.refreshed_at) from auth.sessions s where s.user_id = au.id),
            (select max(t.created_at) from public.transactions t where t.user_id = au.id),
            (select max(k.created_at) from public.tasks k where k.user_id = au.id)
          ) as last_seen,
          pr.seen_at as online_at,
          coalesce((select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id = au.id), '[]'::jsonb) as providers,
          (select i.identity_data->>'email' from auth.identities i
            where i.user_id = au.id and i.provider = 'google'
            order by i.created_at limit 1) as google_email,
          (select coalesce(i.identity_data->>'avatar_url', i.identity_data->>'picture')
            from auth.identities i
            where i.user_id = au.id and i.provider = 'google'
            order by i.created_at limit 1) as avatar_url,
          (select count(*) from public.wallets w where w.user_id = au.id and not w.archived) as wallets,
          (select count(*) from public.transactions t where t.user_id = au.id) as transactions,
          (select count(*) from public.tasks k where k.user_id = au.id and not k.done) as tasks_open,
          (select count(*) from public.tasks k where k.user_id = au.id and k.done) as tasks_done,
          coalesce((select sum(g.calls) from public.ai_usage g where g.user_id = au.id), 0) as ai_calls,
          (au.banned_until is not null and au.banned_until > now()) as banned,
          coalesce(p.access_money, true) as access_money,
          coalesce(p.access_tasks, true) as access_tasks,
          coalesce(p.access_ai, true) as access_ai,
          coalesce(p.access_fem, true) as access_fem
        from auth.users au
        left join public.profiles p on p.id = au.id
        left join public.presence pr on pr.user_id = au.id
        left join public.user_numbers un on un.user_id = au.id
        where au.deleted_at is null
      ) u
    ), '[]'::jsonb),

    'totals', jsonb_build_object(
      'online',      (select count(*) from public.presence where seen_at > now() - interval '2 minutes'),
      'users',       (select count(*) from auth.users where deleted_at is null),
      'new_7d',      (select count(*) from auth.users where deleted_at is null and created_at > week_ago),
      'new_30d',     (select count(*) from auth.users where deleted_at is null and created_at > month_ago),
      'active_7d',   (select count(distinct x.id) from (
                        select id from auth.users where last_sign_in_at > week_ago
                        union select user_id from auth.sessions where refreshed_at > week_ago) x),
      'active_30d',  (select count(distinct x.id) from (
                        select id from auth.users where last_sign_in_at > month_ago
                        union select user_id from auth.sessions where refreshed_at > month_ago) x),
      'money_users', (select count(distinct user_id) from public.transactions),
      'tasks_users', (select count(distinct user_id) from public.tasks),
      'transactions',(select count(*) from public.transactions),
      'tasks',       (select count(*) from public.tasks)
    ),

    'database', jsonb_build_object(
      'size_bytes',  pg_catalog.pg_database_size(current_database()),
      'tables', coalesce((
        select jsonb_agg(jsonb_build_object('name', t.relname, 'bytes', t.bytes, 'rows', t.rows) order by t.bytes desc)
        from (
          select c.relname, pg_catalog.pg_total_relation_size(c.oid) as bytes,
                 coalesce(st.n_live_tup, 0) as rows
          from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          left join pg_catalog.pg_stat_user_tables st on st.relid = c.oid
          where n.nspname = 'public' and c.relkind = 'r'
            -- Таблицы FemDots не показываем даже числом строк: данные о здоровье.
            and c.relname not like 'fem\_%'
        ) t
      ), '[]'::jsonb)
    ),

    'storage', jsonb_build_object(
      'size_bytes', coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects o), 0),
      'files',      (select count(*) from storage.objects)
    )
  );
end;
$function$;
