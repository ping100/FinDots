-- Findots — начальная схема.
-- Все таблицы закрыты RLS: строка видна только своему владельцу (auth.uid()).

create extension if not exists "pgcrypto";

-- ───────────────────────────── профиль ─────────────────────────────

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  base_currency text        not null default 'KZT',
  theme         text        not null default 'light' check (theme in ('dark', 'light')),
  ai_model      text        not null default 'meta-llama/llama-3.3-70b-instruct:free',
  created_at    timestamptz not null default now()
);

-- ──────────────────────────── курсы валют ───────────────────────────
-- rate_to_base — сколько единиц базовой валюты стоит 1 единица code.

create table public.exchange_rates (
  user_id      uuid    not null references auth.users (id) on delete cascade,
  code         text    not null,
  rate_to_base numeric(18, 6) not null check (rate_to_base > 0),
  updated_at   timestamptz not null default now(),
  primary key (user_id, code)
);

-- ────────────────────────── кошельки и долги ────────────────────────
-- Долги живут в той же таблице, что и кошельки: на главном экране это
-- такие же иконки, и в них так же можно перетаскивать деньги.
--   cash / card — обычные кошельки, баланс = доступные деньги
--   debt_out    — я должен, баланс = остаток долга
--   debt_in     — мне должны, баланс = сколько мне вернут

create table public.wallets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('cash', 'card', 'debt_out', 'debt_in')),
  name            text not null,
  icon            text not null default 'wallet',
  color           text not null default '#3b82f6',
  currency        text not null default 'KZT',
  initial_balance numeric(14, 2) not null default 0,
  sort_order      int  not null default 0,
  archived        boolean not null default false,
  -- поля долгов / кредитов / ежемесячных платежей
  due_date        date,
  reminder_days   int,
  monthly_payment numeric(14, 2),
  is_recurring    boolean not null default false,
  recurring_day   int check (recurring_day between 1 and 31),
  note            text,
  created_at      timestamptz not null default now()
);

create index wallets_user_idx on public.wallets (user_id, archived, sort_order);

-- ───────────────────────────── категории ────────────────────────────

create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null check (kind in ('income', 'expense')),
  name          text not null,
  icon          text not null default 'circle',
  color         text not null default '#64748b',
  monthly_limit numeric(14, 2),
  sort_order    int  not null default 0,
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index categories_user_idx on public.categories (user_id, kind, archived, sort_order);

-- ───────────────────────────── операции ─────────────────────────────
--   income     — доход зачислен в категорию дохода (ещё не в кошельке)
--   allocation — часть дохода перенесена в кошелёк (parent_id → income)
--   expense    — трата из кошелька в категорию расхода
--   transfer   — перенос между кошельками (в т.ч. погашение долга)
--   adjustment — ручная корректировка баланса кошелька (знак любой)

create table public.transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  type           text not null check (type in ('income', 'allocation', 'expense', 'transfer', 'adjustment')),
  amount         numeric(14, 2) not null,
  currency       text not null,
  category_id    uuid references public.categories (id) on delete set null,
  wallet_id      uuid references public.wallets (id) on delete cascade,
  from_wallet_id uuid references public.wallets (id) on delete cascade,
  to_wallet_id   uuid references public.wallets (id) on delete cascade,
  parent_id      uuid references public.transactions (id) on delete cascade,
  occurred_at    timestamptz not null default now(),
  note           text,
  created_at     timestamptz not null default now(),

  -- у всех типов кроме корректировки сумма строго положительная
  constraint amount_positive check (type = 'adjustment' or amount > 0),
  constraint shape_ok check (
    (type = 'income'     and category_id is not null and wallet_id is null) or
    (type = 'allocation' and wallet_id   is not null and parent_id is not null) or
    (type = 'expense'    and category_id is not null and wallet_id is not null) or
    (type = 'transfer'   and from_wallet_id is not null and to_wallet_id is not null
                         and from_wallet_id <> to_wallet_id) or
    (type = 'adjustment' and wallet_id is not null)
  )
);

create index transactions_user_time_idx on public.transactions (user_id, occurred_at desc);
create index transactions_parent_idx     on public.transactions (parent_id);
create index transactions_wallet_idx     on public.transactions (user_id, wallet_id);

-- ────────────────────── лимит обращений к AI ───────────────────────

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default current_date,
  calls   int  not null default 0,
  primary key (user_id, day)
);

-- ─────────────────────────── конвертация ───────────────────────────

create or replace function public.convert_amount(
  p_user uuid, p_amount numeric, p_from text, p_to text
) returns numeric
language sql stable security invoker set search_path = public as $$
  select case
    when p_from = p_to then p_amount
    else p_amount
         * coalesce((select rate_to_base from public.exchange_rates
                     where user_id = p_user and code = p_from), 1)
         / nullif(coalesce((select rate_to_base from public.exchange_rates
                            where user_id = p_user and code = p_to), 1), 0)
  end;
$$;

-- ─────────────────────── баланс каждого кошелька ────────────────────
-- Для долгов «я должен» поток инвертирован: приход денег гасит долг.

create or replace view public.wallet_balances
with (security_invoker = true) as
with flows as (
  select w.id as wallet_id, w.user_id,
         case when w.kind = 'debt_out' then -1 else 1 end as sign,
         w.currency, w.initial_balance
    from public.wallets w
),
moves as (
  select f.wallet_id, f.user_id,
         sum(
           case
             when t.type in ('allocation') and t.wallet_id = f.wallet_id
               then  f.sign * public.convert_amount(f.user_id, t.amount, t.currency, f.currency)
             when t.type = 'expense' and t.wallet_id = f.wallet_id
               then -f.sign * public.convert_amount(f.user_id, t.amount, t.currency, f.currency)
             when t.type = 'transfer' and t.to_wallet_id = f.wallet_id
               then  f.sign * public.convert_amount(f.user_id, t.amount, t.currency, f.currency)
             when t.type = 'transfer' and t.from_wallet_id = f.wallet_id
               then -f.sign * public.convert_amount(f.user_id, t.amount, t.currency, f.currency)
             -- корректировка задаётся уже в терминах отображаемого баланса
             when t.type = 'adjustment' and t.wallet_id = f.wallet_id
               then public.convert_amount(f.user_id, t.amount, t.currency, f.currency)
             else 0
           end
         ) as delta
    from flows f
    join public.transactions t
      on t.user_id = f.user_id
     and f.wallet_id in (t.wallet_id, t.from_wallet_id, t.to_wallet_id)
   group by f.wallet_id, f.user_id
)
select f.user_id,
       f.wallet_id,
       f.currency,
       round(f.initial_balance + coalesce(m.delta, 0), 2) as balance
  from flows f
  left join moves m on m.wallet_id = f.wallet_id;

-- ───────────── нераспределённый доход по категориям дохода ──────────

create or replace view public.income_pools
with (security_invoker = true) as
select i.user_id,
       i.category_id,
       i.currency,
       round(sum(i.amount) - coalesce(sum(a.allocated), 0), 2) as unallocated
  from public.transactions i
  left join lateral (
    select sum(public.convert_amount(i.user_id, t.amount, t.currency, i.currency)) as allocated
      from public.transactions t
     where t.parent_id = i.id and t.type = 'allocation'
  ) a on true
 where i.type = 'income'
 group by i.user_id, i.category_id, i.currency
having round(sum(i.amount) - coalesce(sum(a.allocated), 0), 2) > 0;

-- ─────────────────────────────── RLS ────────────────────────────────

alter table public.profiles       enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.wallets        enable row level security;
alter table public.categories     enable row level security;
alter table public.transactions   enable row level security;
alter table public.ai_usage       enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own rates" on public.exchange_rates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own wallets" on public.wallets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own categories" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own transactions" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own ai usage" on public.ai_usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Представления наследуют RLS базовых таблиц (security_invoker),
-- но права на сам объект нужно выдать явно.
grant select on public.wallet_balances to authenticated;
grant select on public.income_pools   to authenticated;
grant execute on function public.convert_amount(uuid, numeric, text, text) to authenticated;

-- ─────────────── что заводится при регистрации ────────────────
-- Только профиль и курсы валют. Ни категорий, ни кошельков, ни банков:
-- пользователь создаёт каждый кружок сам через «+».

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));

  insert into public.exchange_rates (user_id, code, rate_to_base) values
    (new.id, 'KZT', 1), (new.id, 'RUB', 5.8), (new.id, 'USD', 520);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
