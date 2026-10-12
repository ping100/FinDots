-- Какие курсы показывать на панели Findots и на главной (до трёх, по
-- порядку выбора). По умолчанию — доллар и рубль, как было.
alter table public.profiles add column shown_rates text[] not null default '{USD,RUB}'
  check (cardinality(shown_rates) <= 3);
