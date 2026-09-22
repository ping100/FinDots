-- Размер шрифта — настройка доступности, а не украшение: человеку постарше
-- цифры в 11 пикселей разглядеть тяжело. Храним в профиле, чтобы выбор
-- переезжал между устройствами вместе с темой.
alter table public.profiles
  add column text_scale text not null default 'medium'
  check (text_scale in ('small', 'medium', 'large'));
