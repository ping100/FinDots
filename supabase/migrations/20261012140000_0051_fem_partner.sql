-- FemDots: партнёрский режим. Владелица приглашает по коду, партнёр
-- (другая учётная запись Dots) видит её цикл только для чтения, а
-- настроение и самочувствие — только если она разрешила.
--
-- Прямого доступа к fem_* у партнёра нет: всё через функции ниже, которые
-- сами проверяют, кто спрашивает, и отдают только разрешённое.

create table public.fem_shares (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  partner_id uuid unique references auth.users(id) on delete set null,
  code text not null unique,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  share_mood boolean not null default false,
  share_symptoms boolean not null default false,
  -- Партнёр сам решает, напоминать ли ему о скорых месячных.
  partner_remind boolean not null default true,
  partner_reminded_for date,
  -- Приглашение отозвано: строка остаётся, но код сменён и не действует.
  active boolean not null default true
);

-- Политик нет совсем: таблицу читают и меняют только функции ниже.
alter table public.fem_shares enable row level security;
revoke all on public.fem_shares from anon, authenticated;

-- ───────────────────────── владелица ─────────────────────────

-- Новый код (8 знаков без похожих 0/O, 1/I — его диктуют и вводят руками).
create function public.fem_new_code()
returns text
language sql volatile set search_path to ''
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
    from generate_series(1, 8);
$$;

-- Пригласить заново: прежний код перестаёт работать, прежний партнёр
-- отключается.
create function public.fem_share_create(p_mood boolean, p_symptoms boolean)
returns text
language plpgsql security definer set search_path to ''
as $$
declare
  v_code text := public.fem_new_code();
begin
  if auth.uid() is null then raise exception 'Нет входа' using errcode = '42501'; end if;
  insert into public.fem_shares (owner_id, code, share_mood, share_symptoms)
  values (auth.uid(), v_code, p_mood, p_symptoms)
  on conflict (owner_id) do update
    set code = excluded.code, share_mood = excluded.share_mood, share_symptoms = excluded.share_symptoms,
        partner_id = null, accepted_at = null, active = true, created_at = now(), partner_reminded_for = null;
  return v_code;
end;
$$;

create function public.fem_share_update(p_mood boolean, p_symptoms boolean)
returns void
language sql security definer set search_path to ''
as $$
  update public.fem_shares set share_mood = p_mood, share_symptoms = p_symptoms
   where owner_id = auth.uid();
$$;

-- Отозвать: партнёр сразу теряет доступ, код больше не действует.
create function public.fem_share_revoke()
returns void
language sql security definer set search_path to ''
as $$
  update public.fem_shares
     set active = false, partner_id = null, accepted_at = null, code = public.fem_new_code()
   where owner_id = auth.uid();
$$;

create function public.fem_share_mine()
returns table(code text, partner_name text, accepted_at timestamptz, share_mood boolean, share_symptoms boolean)
language sql stable security definer set search_path to ''
as $$
  select s.code,
         case when s.partner_id is null then null
              else coalesce(nullif(trim(p.display_name), ''), 'Партнёр') end,
         s.accepted_at, s.share_mood, s.share_symptoms
    from public.fem_shares s
    left join public.profiles p on p.id = s.partner_id
   where s.owner_id = auth.uid() and s.active;
$$;

-- ───────────────────────── партнёр ─────────────────────────

create function public.fem_share_accept(p_code text)
returns text
language plpgsql security definer set search_path to ''
as $$
declare
  v_share public.fem_shares;
begin
  if auth.uid() is null then raise exception 'Нет входа' using errcode = '42501'; end if;
  select * into v_share from public.fem_shares where code = upper(trim(p_code)) and active;
  if not found then raise exception 'Код не найден — проверьте, нет ли опечатки'; end if;
  if v_share.owner_id = auth.uid() then raise exception 'Это ваш собственный код'; end if;
  if v_share.partner_id is not null and v_share.partner_id <> auth.uid() then
    raise exception 'По этому коду уже подключился другой человек';
  end if;
  -- Смотреть можно только один цикл: новое подключение заменяет прежнее.
  update public.fem_shares set partner_id = null, accepted_at = null
   where partner_id = auth.uid() and owner_id <> v_share.owner_id;
  update public.fem_shares set partner_id = auth.uid(), accepted_at = now()
   where owner_id = v_share.owner_id;
  -- FemDots появляется у партнёра на главной.
  update public.profiles set apps_enabled = array_append(apps_enabled, 'fem')
   where id = auth.uid() and not ('fem' = any (apps_enabled));
  return (select coalesce(nullif(trim(display_name), ''), 'Партнёр') from public.profiles where id = v_share.owner_id);
end;
$$;

create function public.fem_partner_leave()
returns void
language sql security definer set search_path to ''
as $$
  update public.fem_shares set partner_id = null, accepted_at = null
   where partner_id = auth.uid();
$$;

create function public.fem_partner_remind(p_on boolean)
returns void
language sql security definer set search_path to ''
as $$
  update public.fem_shares set partner_remind = p_on where partner_id = auth.uid();
$$;

-- Всё, что видит партнёр: имя, длины цикла, даты месячных и — если
-- разрешено — сегодняшние настроение и самочувствие.
create function public.fem_partner_view()
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
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object('id', fp.id, 'start_date', fp.start_date, 'end_date', fp.end_date) order by fp.start_date)
        from public.fem_periods fp where fp.user_id = s.owner_id
    ), '[]'::jsonb),
    'today', (
      select jsonb_build_object(
        'mood', case when s.share_mood then d.mood end,
        'symptoms', case when s.share_symptoms then to_jsonb(d.symptoms) else '[]'::jsonb end
      )
        from public.fem_days d
       where d.user_id = s.owner_id
         and d.day = (now() at time zone coalesce(p.time_zone, 'Asia/Almaty'))::date
         and (s.share_mood or s.share_symptoms)
    )
  )
    from public.fem_shares s
    join public.profiles p on p.id = s.owner_id
    left join public.fem_settings fs on fs.user_id = s.owner_id
   where s.partner_id = auth.uid() and s.active;
$$;

revoke all on function public.fem_new_code() from public, anon, authenticated;
revoke all on function public.fem_share_create(boolean, boolean), public.fem_share_update(boolean, boolean),
  public.fem_share_revoke(), public.fem_share_mine(), public.fem_share_accept(text), public.fem_partner_leave(),
  public.fem_partner_remind(boolean), public.fem_partner_view() from public, anon;
grant execute on function public.fem_share_create(boolean, boolean), public.fem_share_update(boolean, boolean),
  public.fem_share_revoke(), public.fem_share_mine(), public.fem_share_accept(text), public.fem_partner_leave(),
  public.fem_partner_remind(boolean), public.fem_partner_view() to authenticated;

-- ───────────────────── напоминание партнёру ─────────────────────
-- «Скоро месячные» — за 2 дня, тот же прогноз, что у владелицы.
create function public.due_fem_partner_reminders(p_now timestamptz default now())
returns table(partner_id uuid, owner_name text, mark date, days_left int)
language sql stable security definer set search_path to ''
as $$
  with s as (
    select sh.*, coalesce(nullif(trim(op.display_name), ''), 'Партнёрша') as owner_name,
           (p_now at time zone coalesce(pp.time_zone, 'Asia/Almaty')) as local_now,
           coalesce(fs.cycle_length, 28) as fallback
      from public.fem_shares sh
      join public.profiles op on op.id = sh.owner_id
      join public.profiles pp on pp.id = sh.partner_id
      left join public.fem_settings fs on fs.user_id = sh.owner_id
     where sh.partner_id is not null and sh.partner_remind and sh.active
       and exists (select 1 from public.push_subscriptions x where x.user_id = sh.partner_id)
  ),
  gaps as (
    select fp.user_id, fp.start_date - lag(fp.start_date) over (partition by fp.user_id order by fp.start_date) as gap,
           row_number() over (partition by fp.user_id order by fp.start_date desc) as rn
      from public.fem_periods fp
  ),
  avg_gap as (
    select g.user_id, round(avg(g.gap))::int as cycle
      from gaps g where g.gap between 15 and 60 and g.rn <= 7 group by g.user_id
  ),
  n as (
    select s.*, (select max(fp.start_date) from public.fem_periods fp where fp.user_id = s.owner_id)
                + coalesce(a.cycle, s.fallback) as next_start
      from s left join avg_gap a on a.user_id = s.owner_id
  )
  select n.partner_id, n.owner_name, n.next_start, (n.next_start - n.local_now::date)::int
    from n
   where n.next_start is not null
     and n.local_now::date between n.next_start - 2 and n.next_start
     and n.local_now::time >= time '10:00'
     and n.partner_reminded_for is distinct from n.next_start;
$$;

revoke all on function public.due_fem_partner_reminders(timestamptz) from public, anon, authenticated;

create function public.claim_due_fem_partner_reminders(p_secret text)
returns table(endpoint text, p256dh text, auth text, owner_name text, mark date, days_left int)
language plpgsql security definer set search_path to ''
as $$
#variable_conflict use_column
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret') then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return query
  with x as (select * from public.due_fem_partner_reminders()),
  claimed as (
    update public.fem_shares sh set partner_reminded_for = x.mark
      from x
     where sh.partner_id = x.partner_id and sh.partner_reminded_for is distinct from x.mark
    returning sh.partner_id, x.owner_name, x.mark, x.days_left
  )
  select s.endpoint, s.p256dh, s.auth, c.owner_name, c.mark, c.days_left
    from claimed c join public.push_subscriptions s on s.user_id = c.partner_id;
end;
$$;

create function public.kick_fem_partner_reminders()
returns void
language plpgsql security definer set search_path to ''
as $$
begin
  if exists (select 1 from public.due_fem_partner_reminders()) then
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

revoke all on function public.kick_fem_partner_reminders() from public, anon, authenticated;

select cron.schedule('fem-partner-reminders', '*/10 * * * *', 'select public.kick_fem_partner_reminders()');
