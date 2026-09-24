-- Напоминание — отдельный выбор, а не следствие времени: задача на 19:43
-- не обязана дёргать телефон. Время говорит, где задача в списке дня;
-- remind — нужно ли о ней напомнить.
alter table public.tasks
  add column remind boolean not null default false;

-- Напоминать не о чем, если не сказано когда.
alter table public.tasks
  add constraint remind_needs_time check (not remind or time is not null);
