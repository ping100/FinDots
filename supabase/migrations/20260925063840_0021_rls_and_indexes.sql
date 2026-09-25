-- Уборка по советам Supabase: быстрее правила доступа, индексы под связи,
-- у анонимов — никаких прав на таблицы с данными людей.

-- 1. Правила доступа. auth.uid() без select вычисляется заново для каждой
-- строки; в (select auth.uid()) — один раз на запрос. И правила только для
-- вошедших: анониму здесь делать нечего.
drop policy "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy "own rates" on public.exchange_rates;
create policy "own rates" on public.exchange_rates for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy "own ai usage" on public.ai_usage;
create policy "own ai usage" on public.ai_usage for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy "own transactions" on public.transactions;
create policy "own transactions" on public.transactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy "own categories" on public.categories;
create policy "own categories" on public.categories for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy "own wallets" on public.wallets;
create policy "own wallets" on public.wallets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy "own ai key" on public.ai_keys;
create policy "own ai key" on public.ai_keys for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy "Свои задачи" on public.tasks;
create policy "Свои задачи" on public.tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 2. Анонимам — ни чтения, ни записи. Правила и так не пускали, но права
-- на таблицу — первая дверь, и держать её открытой незачем.
revoke all on public.profiles, public.exchange_rates, public.ai_usage, public.transactions,
  public.categories, public.wallets, public.ai_keys, public.tasks
  from anon;
-- TRUNCATE обходит правила строк: через API до него не добраться, но
-- и вошедшим он не нужен.
revoke truncate on public.profiles, public.exchange_rates, public.ai_usage, public.transactions,
  public.categories, public.wallets, public.ai_keys, public.tasks
  from authenticated;

-- 3. Индексы под связи: удаление кошелька или категории иначе просматривает
-- все операции целиком.
create index if not exists transactions_wallet_fk_idx on public.transactions (wallet_id);
create index if not exists transactions_from_wallet_fk_idx on public.transactions (from_wallet_id);
create index if not exists transactions_to_wallet_fk_idx on public.transactions (to_wallet_id);
create index if not exists transactions_category_fk_idx on public.transactions (category_id);
create index if not exists transactions_subcategory_fk_idx on public.transactions (subcategory_id);
create index if not exists categories_parent_fk_idx on public.categories (parent_id);

-- Прежние частичные индексы по (user_id, …) связь не покрывали и не
-- использовались ни разу — их место заняли индексы выше.
drop index if exists public.transactions_subcategory_idx;
drop index if exists public.categories_parent_idx;
