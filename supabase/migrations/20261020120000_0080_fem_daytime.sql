-- FemDots: цветок по времени суток (эксперимент) — утро, день, вечер, ночь.
alter table public.profiles add column if not exists fem_daytime boolean not null default false;
grant update (fem_daytime) on public.profiles to authenticated;
