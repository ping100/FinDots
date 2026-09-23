-- Накопления: вклад в банке и обычная копилка.
--
-- Отдельной таблицы нет — это кошелёк вида savings. Все жесты главного
-- экрана (перенести деньги, разнести доход) работают без изменений, баланс
-- считает то же представление wallet_balances, знак у него как у наличных.
--
-- Отличие одно и оно смысловое: эти деньги не свободны. Поэтому в блоке
-- «Кошельки» и в «можно потратить сегодня» они не участвуют — иначе
-- накопления каждый день уговаривали бы потратить больше.

alter table public.wallets drop constraint wallets_kind_check;

alter table public.wallets
  add constraint wallets_kind_check
  check (kind in ('cash', 'card', 'savings', 'debt_out', 'debt_in'));

alter table public.wallets
  -- ставка годовых; пусто — это копилка без процентов
  add column rate numeric(6, 3) check (rate is null or (rate >= 0 and rate <= 1000)),
  -- дата окончания вклада; пусто — бессрочно
  add column term_end date,
  -- цель накопления, для полоски прогресса
  add column goal numeric(14, 2) check (goal is null or goal > 0),
  -- с какого дня капают проценты
  add column opened_on date,
  -- по какую дату проценты уже начислены (дата последнего начисления)
  add column interest_through date;
