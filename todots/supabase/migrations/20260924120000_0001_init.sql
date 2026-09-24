-- ToDots — начальная схема.
-- Имена таблиц (task_categories, tasks) не пересекаются с Findots
-- (categories, transactions) — эту миграцию можно прогнать в том же
-- проекте Supabase, что и Findots, когда экосистема объединит вход.
-- Все таблицы закрыты RLS: строка видна только своему владельцу (auth.uid()).

create extension if not exists "pgcrypto";

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  theme        text not null default 'light' check (theme in ('dark', 'light')),
  created_at   timestamptz not null default now()
);

create table public.task_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  icon       text not null default 'circle',
  color      text not null default '#64748b',
  sort_order int  not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create index task_categories_user_idx on public.task_categories (user_id, archived, sort_order);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  -- null — задача без даты, лежит в «Когда-нибудь»
  date        date,
  -- время задаёт и порядок в списке дня, и момент напоминания — отдельного
  -- поля «напомнить» нет
  time        time,
  category_id uuid references public.task_categories (id) on delete set null,
  priority    text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  done        boolean not null default false,
  sort_order  int not null default 0,
  note        text,
  created_at  timestamptz not null default now()
);

create index tasks_user_date_idx on public.tasks (user_id, date, time);

-- ─────────────────────────────── RLS ────────────────────────────────

alter table public.profiles       enable row level security;
alter table public.task_categories enable row level security;
alter table public.tasks           enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own task categories" on public.task_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own tasks" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────── что заводится при регистрации ────────────────
-- Только профиль. Ни одной категории по умолчанию — так же, как в Findots,
-- первая заводится пользователем через «+».

create or replace function public.handle_new_todots_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_todots
  after insert on auth.users
  for each row execute function public.handle_new_todots_user();
