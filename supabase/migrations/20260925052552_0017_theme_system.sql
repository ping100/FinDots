-- Тема «как в системе»: светлая или тёмная вслед за настройкой телефона.
--
-- Новым людям — она по умолчанию: приложение с первого экрана выглядит так
-- же, как всё остальное на их телефоне. У тех, кто уже выбрал тему сам,
-- ничего не меняется.
alter table public.profiles drop constraint profiles_theme_check;
alter table public.profiles
  add constraint profiles_theme_check check (theme in ('light', 'dark', 'system'));
alter table public.profiles alter column theme set default 'system';
