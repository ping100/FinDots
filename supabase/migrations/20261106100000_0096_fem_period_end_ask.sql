-- FemDots: спросить, закончились ли месячные, если конец забыли отметить.
-- Один раз за цикл, вечером в день после её обычной длины (end_asked_for).
alter table public.fem_settings add column if not exists end_asked_for date;

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
  ),
  -- Последние месячные без отметки конца и её обычная длина (по закрытым отметкам).
  e as (
    select s.*, lp.start_date as last_start, lp.end_date as last_end,
           coalesce((select round(avg(x.len))::int from (
                      select fp.end_date - fp.start_date + 1 as len
                        from public.fem_periods fp
                       where fp.user_id = s.user_id and fp.end_date is not null
                       order by fp.start_date desc limit 6) x
                     where x.len between 2 and 10), s.period_length, 5) as plen
      from s
      join lateral (select fp.start_date, fp.end_date from public.fem_periods fp
                     where fp.user_id = s.user_id order by fp.start_date desc limit 1) lp on true
     where s.pregnant_since is null
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
     and m.method_reminded_for is distinct from m.method_start + 84
  union all
  -- Обычная длина месячных прошла, а конец не отмечен: вечером спросить, закончились ли.
  select e.user_id, 'period_end'::text, e.last_start, e.plen, null::date, e.discreet
    from e
   where e.remind_period
     and e.last_end is null
     and e.local_now::date between e.last_start + e.plen and e.last_start + e.plen + 2
     and e.local_now::time >= time '19:00'
     and e.end_asked_for is distinct from e.last_start;
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
    elsif r.kind = 'period_end' then
      update public.fem_settings fs set end_asked_for = r.mark
       where fs.user_id = r.user_id and fs.end_asked_for is distinct from r.mark;
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
