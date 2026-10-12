-- FemDots: свои статусы и свои просьбы к готовым. Хранятся в настройках
-- (смайлик + текст, до 12 штук); статус дня — «c:смайлик|текст», своя
-- просьба — сигнал kind = 'custom' с item «смайлик|текст».
alter table public.fem_settings
  add column custom_statuses jsonb not null default '[]'::jsonb check (jsonb_typeof(custom_statuses) = 'array' and jsonb_array_length(custom_statuses) <= 12),
  add column custom_asks jsonb not null default '[]'::jsonb check (jsonb_typeof(custom_asks) = 'array' and jsonb_array_length(custom_asks) <= 12);
alter table public.fem_signals drop constraint fem_signals_kind_check;
alter table public.fem_signals add constraint fem_signals_kind_check check (kind in ('care', 'buy', 'alone', 'heart', 'ok', 'custom'));
-- Ответ «Уже бегу» несёт ключ просьбы («custom:смайлик|текст») — нужно место.
alter table public.fem_signals drop constraint fem_signals_item_check;
alter table public.fem_signals add constraint fem_signals_item_check check (char_length(item) <= 80);
