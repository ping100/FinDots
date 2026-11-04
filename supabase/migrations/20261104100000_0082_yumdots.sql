-- Yumdots: учёт калорий. Записи о еде, настройки нормы, доступ, ИИ для фото.

-- Норма: по росту, весу, возрасту, активности и цели; kcal_target — своя.
create table if not exists public.food_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  sex text check (sex in ('female', 'male')),
  birth_year int check (birth_year between 1900 and 2100),
  height_cm numeric check (height_cm between 80 and 260),
  weight_kg numeric check (weight_kg between 20 and 400),
  activity text not null default 'light' check (activity in ('low', 'light', 'moderate', 'high', 'very_high')),
  goal text not null default 'keep' check (goal in ('lose', 'keep', 'gain')),
  kcal_target int check (kcal_target between 500 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.food_settings enable row level security;
create policy "food_settings own" on public.food_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Что съедено: одна строка — одно блюдо. Фото не храним.
create table if not exists public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null check (char_length(name) between 1 and 120),
  grams numeric check (grams >= 0 and grams <= 10000),
  kcal numeric not null check (kcal >= 0 and kcal <= 20000),
  protein numeric not null default 0 check (protein >= 0 and protein <= 2000),
  fat numeric not null default 0 check (fat >= 0 and fat <= 2000),
  carbs numeric not null default 0 check (carbs >= 0 and carbs <= 2000),
  source text not null default 'manual' check (source in ('photo', 'text', 'manual', 'repeat')),
  created_at timestamptz not null default now()
);
create index if not exists food_entries_user_day on public.food_entries (user_id, day);
alter table public.food_entries enable row level security;
create policy "food_entries own" on public.food_entries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.food_settings, public.food_entries to authenticated;

-- Доступ к Yumdots (админ может закрыть) и место на развилке и в отзывах.
alter table public.profiles add column if not exists access_food boolean not null default true;
alter table public.profiles drop constraint if exists profiles_apps_enabled_check;
alter table public.profiles add constraint profiles_apps_enabled_check
  check (apps_enabled <@ array['money', 'tasks', 'fem', 'food'] and cardinality(apps_enabled) >= 1);
alter table public.reviews drop constraint if exists reviews_app_check;
alter table public.reviews add constraint reviews_app_check check (app = any (array['money', 'tasks', 'fem', 'food']));

-- Модель для фото: текстовая модель разбора картинки не видит.
alter table public.app_ai_config add column if not exists vision_model text not null default 'google/gemma-4-31b-it:free';

create or replace function public.ai_config_for_food()
returns table(api_key_enc text, model text)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not coalesce((select p.access_ai from public.profiles p where p.id = auth.uid()), true) then
    raise exception 'ИИ отключён администратором' using errcode = '42501';
  end if;
  return query select c.api_key_enc, c.vision_model from public.app_ai_config c where c.id = true;
end;
$$;
revoke all on function public.ai_config_for_food() from public, anon;
grant execute on function public.ai_config_for_food() to authenticated;
