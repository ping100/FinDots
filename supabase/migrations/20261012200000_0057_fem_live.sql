-- FemDots: «живые» отметки дневника.
-- - Режим беременности (fem_settings.pregnant_since): прогноз месячных,
--   фертильное окно и напоминания о них — на паузе; партнёр видит только
--   «прогноз на паузе».
-- - Партнёру — дни выделений «как белок» (уточняют овуляцию) и, если она
--   делится самочувствием, его история — для прогноза «завтра возможны…».
-- - Напоминания партнёру о месячных — не на гормональной контрацепции и
--   не в беременность.
alter table public.fem_settings add column pregnant_since date;

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
      from c where c.last_start is not null and not c.hormonal and c.pregnant_since is null
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



CREATE OR REPLACE FUNCTION public.due_fem_partner_reminders(p_now timestamp with time zone DEFAULT now())
 RETURNS TABLE(partner_id uuid, owner_name text, mark date, days_left integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
       -- Беременность и гормональная контрацепция — прогноза месячных нет.
       and fs.pregnant_since is null
       and coalesce(fs.method, 'none') in ('none', 'iud_copper')
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
$function$;

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
    -- Прогноз на паузе (беременность) — без объяснения причины: скажет сама.
    'paused', fs.pregnant_since is not null,
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
    'mucus_days', coalesce((
      select jsonb_agg(d.day order by d.day)
        from public.fem_days d
       where d.user_id = s.owner_id and 'd:eggwhite' = any (d.tags) and d.day > current_date - 200
    ), '[]'::jsonb),
    -- История самочувствия — только если она делится им: для прогноза «завтра возможны…».
    'symptom_days', case when s.share_symptoms then coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'symptoms', d.symptoms) order by d.day)
        from public.fem_days d
       where d.user_id = s.owner_id and cardinality(d.symptoms) > 0 and d.day > current_date - 200
    ), '[]'::jsonb) else '[]'::jsonb end,
    'intimacy', coalesce((
      select jsonb_agg(jsonb_build_object('day', i.day, 'protected', i.protected, 'kinds', i.kinds) order by i.day)
        from public.fem_intimacy i
       where i.owner_id = s.owner_id and i.active and i.day > current_date - 400
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
