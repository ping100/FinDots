-- Советы партнёру: оценки «Помогло / Не то», задания недели (partner_state),
-- дневной пуш «удели ей минутку» (partner_nudge), утренний совет с учётом
-- «Что я люблю» и оценок.

alter table public.fem_shares add column if not exists partner_state jsonb not null default '{}'::jsonb;
alter table public.fem_shares add column if not exists partner_nudge boolean not null default true;
alter table public.fem_shares add column if not exists partner_nudged_for date;

-- Своё состояние партнёр пишет целиком: оценки и галочки.
create or replace function public.fem_partner_state_set(p_state jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then raise exception 'Нет входа' using errcode = '42501'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or length(p_state::text) > 20000 then
    raise exception 'Слишком много данных';
  end if;
  update public.fem_shares set partner_state = p_state where partner_id = auth.uid() and active;
end;
$$;
revoke all on function public.fem_partner_state_set(jsonb) from public, anon;
grant execute on function public.fem_partner_state_set(jsonb) to authenticated;

create or replace function public.fem_partner_nudge(p_on boolean)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.fem_shares set partner_nudge = p_on where partner_id = auth.uid();
$$;
revoke all on function public.fem_partner_nudge(boolean) from public, anon;
grant execute on function public.fem_partner_nudge(boolean) to authenticated;

-- Её день для советов: то же, что видит партнёр на экране.
create or replace function public.fem_partner_brief(p_owner uuid, p_mood boolean, p_symptoms boolean, p_goal boolean)
returns jsonb
language sql
stable security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'owner_name', coalesce(nullif(trim(op.display_name), ''), 'Партнёрша'),
    'today', (now() at time zone coalesce(op.time_zone, 'Asia/Almaty'))::date,
    'cycle_length', coalesce(fs.cycle_length, 28),
    'period_length', coalesce(fs.period_length, 5),
    'method', coalesce(fs.method, 'none'),
    'goal', case when p_goal then fs.goal end,
    'likes', coalesce(fs.likes, '{}'::jsonb),
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object('id', fp.id, 'start_date', fp.start_date, 'end_date', fp.end_date) order by fp.start_date)
        from public.fem_periods fp where fp.user_id = p_owner
    ), '[]'::jsonb),
    'lh_days', coalesce((
      select jsonb_agg(d.day order by d.day) from public.fem_days d
       where d.user_id = p_owner and d.lh = 'pos' and d.day > current_date - 200
    ), '[]'::jsonb),
    'mucus_days', coalesce((
      select jsonb_agg(d.day order by d.day) from public.fem_days d
       where d.user_id = p_owner and 'd:eggwhite' = any (d.tags) and d.day > current_date - 200
    ), '[]'::jsonb),
    'mood', (select case when p_mood then d.mood end from public.fem_days d
              where d.user_id = p_owner and d.day = (now() at time zone coalesce(op.time_zone, 'Asia/Almaty'))::date),
    'symptoms', coalesce((select case when p_symptoms then to_jsonb(d.symptoms) end from public.fem_days d
              where d.user_id = p_owner and d.day = (now() at time zone coalesce(op.time_zone, 'Asia/Almaty'))::date), '[]'::jsonb)
  )
    from public.profiles op
    left join public.fem_settings fs on fs.user_id = op.id
   where op.id = p_owner;
$$;
revoke all on function public.fem_partner_brief(uuid, boolean, boolean, boolean) from public, anon, authenticated;

-- Утренний совет — теперь с «Что я люблю» и его оценками.
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
    returning sh.partner_id, sh.owner_id, sh.share_mood, sh.share_symptoms, sh.share_goal, sh.partner_state
  )
  select s.endpoint, s.p256dh, s.auth,
         public.fem_partner_brief(c.owner_id, c.share_mood, c.share_symptoms, c.share_goal)
           || jsonb_build_object('votes', coalesce(c.partner_state -> 'votes', '{}'::jsonb))
    from claimed c join public.push_subscriptions s on s.user_id = c.partner_id;
end;
$$;
revoke all on function public.claim_due_fem_partner_hints(text) from public, authenticated;
grant execute on function public.claim_due_fem_partner_hints(text) to anon;

-- Дневной пуш: раз в день в своё время с 13 до 21 по его часам (у каждого
-- дня — своё), если он сам не писал ей последние 3 часа.
create or replace function public.due_fem_partner_nudges(p_now timestamptz default now())
returns table(partner_id uuid, local_day date)
language sql
stable security definer
set search_path to ''
as $$
  select sh.partner_id, (p_now at time zone coalesce(pp.time_zone, 'Asia/Almaty'))::date
    from public.fem_shares sh
    join public.profiles pp on pp.id = sh.partner_id
    left join public.fem_settings fs on fs.user_id = sh.owner_id
   where sh.active and sh.partner_id is not null and sh.partner_nudge
     and fs.pregnant_since is null
     and exists (select 1 from public.push_subscriptions x where x.user_id = sh.partner_id)
     and sh.partner_nudged_for is distinct from (p_now at time zone coalesce(pp.time_zone, 'Asia/Almaty'))::date
     and (p_now at time zone coalesce(pp.time_zone, 'Asia/Almaty'))::time
         between make_time(13 + abs(hashtext(sh.partner_id::text || (p_now at time zone coalesce(pp.time_zone, 'Asia/Almaty'))::date::text)) % 7, 0, 0)
             and time '21:00'
     and not exists (
       select 1 from public.fem_signals g
        where g.from_id = sh.partner_id and g.to_id = sh.owner_id
          and g.created_at > p_now - interval '3 hours' and g.created_at <= p_now
     );
$$;
revoke all on function public.due_fem_partner_nudges(timestamptz) from public, anon, authenticated;

create or replace function public.claim_due_fem_partner_nudges(p_secret text)
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
  with due as (select * from public.due_fem_partner_nudges()),
  claimed as (
    update public.fem_shares sh set partner_nudged_for = due.local_day
      from due
     where sh.partner_id = due.partner_id and sh.active
    returning sh.partner_id, sh.owner_id, sh.share_mood, sh.share_symptoms, sh.share_goal
  )
  select s.endpoint, s.p256dh, s.auth, public.fem_partner_brief(c.owner_id, c.share_mood, c.share_symptoms, c.share_goal)
    from claimed c join public.push_subscriptions s on s.user_id = c.partner_id;
end;
$$;
revoke all on function public.claim_due_fem_partner_nudges(text) from public, authenticated;
grant execute on function public.claim_due_fem_partner_nudges(text) to anon;

create or replace function public.kick_fem_partner_nudges()
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if exists (select 1 from public.due_fem_partner_nudges()) then
    perform net.http_post(
      url := 'https://dotsapp.vercel.app/api/fem-nudge',
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
revoke all on function public.kick_fem_partner_nudges() from public, anon, authenticated;

select cron.schedule('fem-partner-nudges', '*/10 * * * *', 'select public.kick_fem_partner_nudges()');

-- Его экран: оценки, задания недели и выключатель дневного пуша.
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
    'nudge', s.partner_nudge,
    'state', s.partner_state,
    'share_mood', s.share_mood,
    'share_symptoms', s.share_symptoms,
    'share_status', s.share_status,
    'hormonal', coalesce(fs.method not in ('none', 'iud_copper'), false),
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
