-- FemDots, взаимодействие пары:
-- 1. Ответы на просьбы, «Думаю о тебе» и приглашения: строка-ответ в
--    fem_signals со ссылкой reply_to на то, на что отвечают. По ответам
--    видно, как идёт просьба: отправлено → увидел → бежит → готово.
-- 2. Совет на день партнёру утром (пуш с кнопкой «Сделаю»).
-- 3. «Что она любит» — fem_settings.likes, партнёр видит.
-- 4. Близость с двух сторон: отметка партнёра ждёт её подтверждения
--    (pending) и до этого не попадает в её дневник и прогноз.

-- ───────────────────────────── ответы ─────────────────────────────
alter table public.fem_signals add column if not exists reply_to bigint references public.fem_signals (id) on delete set null;
create index if not exists fem_signals_reply on public.fem_signals (reply_to);

-- Пара — тот, с кем у меня активное подключение (в любую сторону).
create or replace function public.fem_pair_of(p_user uuid)
returns uuid
language sql
stable security definer
set search_path to ''
as $$
  select coalesce(
    (select partner_id from public.fem_shares where owner_id = p_user and active and partner_id is not null),
    (select owner_id from public.fem_shares where partner_id = p_user and active)
  );
$$;
revoke all on function public.fem_pair_of(uuid) from public, anon, authenticated;

-- Ответ: reply — слова («Уже бегу», «И я ❤️», своё), done — «Готово ✅».
create or replace function public.fem_signal_reply(p_to bigint, p_kind text, p_item text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_from uuid;
begin
  if auth.uid() is null then raise exception 'Нет входа' using errcode = '42501'; end if;
  if p_kind not in ('reply', 'done') then raise exception 'Неверный ответ'; end if;
  select g.from_id into v_from from public.fem_signals g where g.id = p_to and g.to_id = auth.uid();
  if v_from is null then raise exception 'Нет такой просьбы'; end if;
  if public.fem_pair_of(auth.uid()) is distinct from v_from then raise exception 'Партнёр не подключён'; end if;
  if (select count(*) from public.fem_signals
       where from_id = auth.uid() and created_at > now() - interval '1 day') >= 60 then
    raise exception 'Слишком много за сутки — попробуйте завтра';
  end if;
  insert into public.fem_signals (from_id, to_id, kind, item, reply_to)
  values (auth.uid(), v_from, p_kind, left(nullif(trim(p_item), ''), 200), p_to);
  update public.fem_signals set seen_at = coalesce(seen_at, now()) where id = p_to;
end;
$$;
revoke all on function public.fem_signal_reply(bigint, text, text) from public, anon;
grant execute on function public.fem_signal_reply(bigint, text, text) to authenticated;

-- Для пуша: подписки, текст и — для ответа — на что отвечают.
create or replace function public.fem_signal_push_info(p_secret text, p_id bigint)
returns table(endpoint text, p256dh text, auth text, kind text, item text, from_name text, discreet boolean, reply_kind text, reply_item text)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret') then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return query
    select x.endpoint, x.p256dh, x.auth, g.kind, g.item,
           coalesce(nullif(trim(p.display_name), ''), 'Партнёр'),
           coalesce((select fs.discreet from public.fem_settings fs where fs.user_id = g.to_id), false),
           r.kind, r.item
      from public.fem_signals g
      join public.profiles p on p.id = g.from_id
      join public.push_subscriptions x on x.user_id = g.to_id
      left join public.fem_signals r on r.id = g.reply_to
     where g.id = p_id;
end;
$$;
revoke all on function public.fem_signal_push_info(text, bigint) from public, authenticated;
grant execute on function public.fem_signal_push_info(text, bigint) to anon;

-- ───────────────────────────── «что она любит» ─────────────────────────────
alter table public.fem_settings add column if not exists likes jsonb not null default '{}'::jsonb;

-- ───────────────────────────── близость с двух сторон ─────────────────────────────
alter table public.fem_intimacy add column if not exists pending boolean not null default false;

-- Партнёр предлагает отметку — она подтверждает. Её собственную отметку
-- за тот же день партнёр не трогает.
create or replace function public.fem_partner_intimacy_set(p_day date, p_kinds text[], p_protected boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_owner uuid;
  v_kinds text[] := coalesce(p_kinds, '{}');
begin
  if auth.uid() is null then raise exception 'Нет входа' using errcode = '42501'; end if;
  select owner_id into v_owner from public.fem_shares where partner_id = auth.uid() and active;
  if v_owner is null then raise exception 'Вы не подключены к циклу'; end if;
  if p_day > current_date + 1 or p_day < current_date - 30 then raise exception 'Неверная дата'; end if;
  if exists (select 1 from public.fem_intimacy i
              where i.owner_id = v_owner and i.day = p_day and i.active and not i.pending) then
    raise exception 'Этот день уже отмечен';
  end if;
  if cardinality(v_kinds) = 0 then
    -- Передумал — снимаем только свою неподтверждённую.
    update public.fem_intimacy set active = false, pending = false
     where owner_id = v_owner and day = p_day and pending;
    update public.fem_signals set dismissed_at = now()
     where to_id = v_owner and from_id = auth.uid() and kind = 'intim' and split_part(item, '|', 1) = p_day::text
       and dismissed_at is null;
    return;
  end if;
  insert into public.fem_intimacy (owner_id, day, protected, kinds, added_by, active, pending, shared)
  values (v_owner, p_day, p_protected, v_kinds, auth.uid(), true, true, true)
  on conflict (owner_id, day) do update
    set protected = excluded.protected, kinds = excluded.kinds, active = true, pending = true,
        shared = true, added_by = excluded.added_by, created_at = now();
  insert into public.fem_signals (from_id, to_id, kind, item)
  values (auth.uid(), v_owner, 'intim',
          p_day::text || '|' || array_to_string(v_kinds, ',') || '|' || coalesce(p_protected::text, ''));
end;
$$;

-- Её ответ: было — отметка становится настоящей; не было — снимается.
create or replace function public.fem_intimacy_confirm(p_day date, p_ok boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then raise exception 'Нет входа' using errcode = '42501'; end if;
  update public.fem_intimacy set pending = false, active = p_ok
   where owner_id = auth.uid() and day = p_day and pending;
  update public.fem_signals set dismissed_at = now(), seen_at = coalesce(seen_at, now())
   where to_id = auth.uid() and kind = 'intim' and split_part(item, '|', 1) = p_day::text and dismissed_at is null;
end;
$$;
revoke all on function public.fem_intimacy_confirm(date, boolean) from public, anon;
grant execute on function public.fem_intimacy_confirm(date, boolean) to authenticated;

-- ───────────────────────────── совет на день ─────────────────────────────
alter table public.fem_shares add column if not exists partner_hint boolean not null default true;
alter table public.fem_shares add column if not exists partner_hinted_for date;

create or replace function public.fem_partner_hint(p_on boolean)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.fem_shares set partner_hint = p_on where partner_id = auth.uid();
$$;
revoke all on function public.fem_partner_hint(boolean) from public, anon;
grant execute on function public.fem_partner_hint(boolean) to authenticated;

-- Кому пора: с 9 до 12 по его часам, раз в день, если прогноз не на паузе
-- и есть хоть одна отметка месячных.
create or replace function public.due_fem_partner_hints(p_now timestamptz default now())
returns table(partner_id uuid, local_day date)
language sql
stable security definer
set search_path to ''
as $$
  select sh.partner_id, (p_now at time zone coalesce(pp.time_zone, 'Asia/Almaty'))::date
    from public.fem_shares sh
    join public.profiles pp on pp.id = sh.partner_id
    left join public.fem_settings fs on fs.user_id = sh.owner_id
   where sh.active and sh.partner_id is not null and sh.partner_hint
     and fs.pregnant_since is null
     and exists (select 1 from public.push_subscriptions x where x.user_id = sh.partner_id)
     and exists (select 1 from public.fem_periods fp where fp.user_id = sh.owner_id)
     and (p_now at time zone coalesce(pp.time_zone, 'Asia/Almaty'))::time between time '09:00' and time '12:00'
     and sh.partner_hinted_for is distinct from (p_now at time zone coalesce(pp.time_zone, 'Asia/Almaty'))::date;
$$;
revoke all on function public.due_fem_partner_hints(timestamptz) from public, anon, authenticated;

-- Забрать (и отметить отправленными) советы с данными для расчёта.
create or replace function public.claim_due_fem_partner_hints(p_secret text)
returns table(endpoint text, p256dh text, auth text, data jsonb)
language plpgsql
security definer
set search_path to ''
as $$
#variable_conflict use_column
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret') then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return query
  with due as (select * from public.due_fem_partner_hints()),
  claimed as (
    update public.fem_shares sh set partner_hinted_for = due.local_day
      from due
     where sh.partner_id = due.partner_id and sh.active
    returning sh.partner_id, sh.owner_id, sh.share_mood, sh.share_symptoms, sh.share_goal
  ),
  info as (
    select c.partner_id, jsonb_build_object(
      'owner_name', coalesce(nullif(trim(op.display_name), ''), 'Партнёрша'),
      'today', (now() at time zone coalesce(op.time_zone, 'Asia/Almaty'))::date,
      'cycle_length', coalesce(fs.cycle_length, 28),
      'period_length', coalesce(fs.period_length, 5),
      'method', coalesce(fs.method, 'none'),
      'goal', case when c.share_goal then fs.goal end,
      'periods', coalesce((
        select jsonb_agg(jsonb_build_object('id', fp.id, 'start_date', fp.start_date, 'end_date', fp.end_date) order by fp.start_date)
          from public.fem_periods fp where fp.user_id = c.owner_id
      ), '[]'::jsonb),
      'lh_days', coalesce((
        select jsonb_agg(d.day order by d.day) from public.fem_days d
         where d.user_id = c.owner_id and d.lh = 'pos' and d.day > current_date - 200
      ), '[]'::jsonb),
      'mucus_days', coalesce((
        select jsonb_agg(d.day order by d.day) from public.fem_days d
         where d.user_id = c.owner_id and 'd:eggwhite' = any (d.tags) and d.day > current_date - 200
      ), '[]'::jsonb),
      'mood', (select case when c.share_mood then d.mood end from public.fem_days d
                where d.user_id = c.owner_id and d.day = (now() at time zone coalesce(op.time_zone, 'Asia/Almaty'))::date),
      'symptoms', coalesce((select case when c.share_symptoms then to_jsonb(d.symptoms) end from public.fem_days d
                where d.user_id = c.owner_id and d.day = (now() at time zone coalesce(op.time_zone, 'Asia/Almaty'))::date), '[]'::jsonb)
    ) as data
      from claimed c
      join public.profiles op on op.id = c.owner_id
      left join public.fem_settings fs on fs.user_id = c.owner_id
  )
  select s.endpoint, s.p256dh, s.auth, i.data
    from info i join public.push_subscriptions s on s.user_id = i.partner_id;
end;
$$;
revoke all on function public.claim_due_fem_partner_hints(text) from public, authenticated;
grant execute on function public.claim_due_fem_partner_hints(text) to anon;

create or replace function public.kick_fem_partner_hints()
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if exists (select 1 from public.due_fem_partner_hints()) then
    perform net.http_post(
      url := 'https://dotsapp.vercel.app/api/fem-hints',
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
revoke all on function public.kick_fem_partner_hints() from public, anon, authenticated;

select cron.schedule('fem-partner-hints', '*/10 * * * *', 'select public.kick_fem_partner_hints()');

-- ───────────────────────────── что видит партнёр ─────────────────────────────
create or replace function public.fem_partner_view()
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select jsonb_build_object(
    'owner_name', coalesce(nullif(trim(p.display_name), ''), 'Партнёрша'),
    'cycle_length', coalesce(fs.cycle_length, 28),
    'period_length', coalesce(fs.period_length, 5),
    'remind', s.partner_remind,
    'hint', s.partner_hint,
    'share_mood', s.share_mood,
    'share_symptoms', s.share_symptoms,
    'share_status', s.share_status,
    'hormonal', coalesce(fs.method not in ('none', 'iud_copper'), false),
    -- Прогноз на паузе (беременность) — без объяснения причины: скажет сама.
    'paused', fs.pregnant_since is not null,
    'goal', case when s.share_goal then fs.goal end,
    'pill_nudge', s.pill_nudge,
    'likes', coalesce(fs.likes, '{}'::jsonb),
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object('id', fp.id, 'start_date', fp.start_date, 'end_date', fp.end_date) order by fp.start_date)
        from public.fem_periods fp where fp.user_id = s.owner_id
    ), '[]'::jsonb),
    'lh_days', coalesce((
      select jsonb_agg(d.day order by d.day)
        from public.fem_days d
       where d.user_id = s.owner_id and d.lh = 'pos' and d.day > current_date - 200
    ), '[]'::jsonb),
    'mucus_days', coalesce((
      select jsonb_agg(d.day order by d.day)
        from public.fem_days d
       where d.user_id = s.owner_id and 'd:eggwhite' = any (d.tags) and d.day > current_date - 200
    ), '[]'::jsonb),
    'symptom_days', case when s.share_symptoms then coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'symptoms', d.symptoms) order by d.day)
        from public.fem_days d
       where d.user_id = s.owner_id and cardinality(d.symptoms) > 0 and d.day > current_date - 200
    ), '[]'::jsonb) else '[]'::jsonb end,
    -- Близость — отметки, которые она показывает, и его ждущие подтверждения.
    'intimacy', coalesce((
      select jsonb_agg(jsonb_build_object('day', i.day, 'protected', i.protected, 'kinds', i.kinds, 'pending', i.pending) order by i.day)
        from public.fem_intimacy i
       where i.owner_id = s.owner_id and i.active and i.shared and i.day > current_date - 400
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
$function$;
