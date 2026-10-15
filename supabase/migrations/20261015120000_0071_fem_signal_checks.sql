-- Новые виды сигналов (ответы, «позабочусь», приглашения, близость) и
-- текст подлиннее: совет на день и свой ответ не влезали в 80 символов.
alter table public.fem_signals drop constraint if exists fem_signals_kind_check;
alter table public.fem_signals add constraint fem_signals_kind_check
  check (kind in ('care', 'buy', 'alone', 'heart', 'ok', 'custom', 'reply', 'done', 'will', 'invite', 'intim'));
alter table public.fem_signals drop constraint if exists fem_signals_item_check;
alter table public.fem_signals add constraint fem_signals_item_check check (char_length(item) <= 200);
