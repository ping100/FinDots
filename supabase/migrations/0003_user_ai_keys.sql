-- Ключ OpenRouter теперь личный: каждый платит за свои разборы бюджета,
-- а не расходует общий ключ владельца приложения.
--
-- Ключ лежит отдельно от профиля намеренно: профиль клиент читает целиком
-- (`select *`), и секрету там не место. Из этой таблицы приложение читает
-- только представление с хвостом ключа, а полное значение берёт серверный
-- роут /api/analyze.

create table public.ai_keys (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  api_key    text not null check (length(api_key) between 8 and 500),
  updated_at timestamptz not null default now()
);

alter table public.ai_keys enable row level security;

create policy "own ai key" on public.ai_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Клиенту достаточно знать, что ключ задан, и последние 4 символа —
-- чтобы отличить один ключ от другого.
create or replace view public.ai_key_status
with (security_invoker = true) as
select user_id,
       right(api_key, 4) as hint,
       updated_at
  from public.ai_keys;

grant select on public.ai_key_status to authenticated;
