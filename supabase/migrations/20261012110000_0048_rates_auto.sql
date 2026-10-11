-- Курсы валют подтягиваются сами (курс Нацбанка РК, раз в полдня при
-- открытии приложения). Можно выключить и вводить вручную, как раньше.
alter table public.profiles add column rates_auto boolean not null default true;
