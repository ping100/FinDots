-- FemDots: цветок по погоде (эксперимент).
-- fem_weather — включено ли; fem_weather_src — у партнёра: своя погода или её.
alter table public.profiles add column if not exists fem_weather boolean not null default false;
alter table public.profiles add column if not exists fem_weather_src text not null default 'mine'
  check (fem_weather_src in ('mine', 'hers'));
grant update (fem_weather, fem_weather_src) on public.profiles to authenticated;

-- Её погода для партнёра: только код погоды, температура, ветер и день/ночь.
-- Ни города, ни координат.
alter table public.fem_shares add column if not exists owner_weather jsonb;
alter table public.fem_shares add column if not exists owner_weather_at timestamptz;

create or replace function public.fem_weather_set(p jsonb)
returns void
language sql
volatile security definer
set search_path to ''
as $$
  update public.fem_shares
     set owner_weather = jsonb_build_object(
           'code', (p->>'code')::int,
           'temp', round((p->>'temp')::numeric),
           'wind', round((p->>'wind')::numeric),
           'day', coalesce((p->>'day')::boolean, true)),
         owner_weather_at = now()
   where owner_id = auth.uid() and active and partner_id is not null;
$$;
revoke all on function public.fem_weather_set(jsonb) from public, anon;
grant execute on function public.fem_weather_set(jsonb) to authenticated;

-- Партнёру — её погода, если она свежая (не старше 3 часов).
create or replace function public.fem_partner_weather()
returns jsonb
language sql
stable security definer
set search_path to ''
as $$
  select s.owner_weather
    from public.fem_shares s
   where s.partner_id = auth.uid() and s.active
     and s.owner_weather_at > now() - interval '3 hours'
   limit 1;
$$;
revoke all on function public.fem_partner_weather() from public, anon;
grant execute on function public.fem_partner_weather() to authenticated;
