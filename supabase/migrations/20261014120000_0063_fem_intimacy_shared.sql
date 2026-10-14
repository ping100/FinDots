-- Отметка близости может быть только для неё: shared = false — партнёр её
-- не видит (в fem_partner_view не попадает), а у неё она по-прежнему
-- учитывается в прогнозе и подсказке про тест.
alter table public.fem_intimacy add column if not exists shared boolean not null default true;

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
    -- Близость — только отметки, которые она показывает партнёру.
    'intimacy', coalesce((
      select jsonb_agg(jsonb_build_object('day', i.day, 'protected', i.protected, 'kinds', i.kinds) order by i.day)
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
