-- Пол — только чтобы FemDots при первом входе не предлагал мужчине
-- отмечать месячные: ему — сразу вход по коду партнёрши. Пусто — ещё
-- не спрашивали.
alter table public.profiles add column if not exists gender text check (gender in ('female', 'male'));
grant update (gender) on public.profiles to authenticated;
