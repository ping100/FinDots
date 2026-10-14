-- История настроения за день: [{ "at": "2026-10-14T09:10:00Z", "mood": "happy" }, ...].
-- fem_days.mood — по-прежнему последнее настроение (его видит партнёр и
-- считают старые отчёты); лента — все отметки дня со временем.
alter table public.fem_days add column if not exists mood_log jsonb not null default '[]'::jsonb;
