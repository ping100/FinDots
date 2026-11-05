-- Yumdots: тренировки и сожжённые калории. Сожжённое за день прибавляется
-- к норме еды. Способы: вид и минуты (считаем по весу), калории с трекера,
-- шаги за день.
create table if not exists public.food_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  kind text not null check (char_length(kind) between 1 and 40),
  minutes int check (minutes > 0 and minutes <= 1440),
  steps int check (steps > 0 and steps <= 200000),
  kcal numeric not null check (kcal >= 0 and kcal <= 10000),
  source text not null default 'calc' check (source in ('calc', 'tracker', 'steps')),
  note text check (char_length(note) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists food_workouts_user_day on public.food_workouts (user_id, day);
alter table public.food_workouts enable row level security;
create policy "food_workouts own" on public.food_workouts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.food_workouts to authenticated;
