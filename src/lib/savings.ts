import type { CurrencyCode, Transaction, Wallet } from "./types";

/**
 * Проценты по вкладу.
 *
 * Считаем по дням: банк начисляет на фактический остаток, и если в середине
 * месяца вклад пополнили, проценты за оставшиеся дни идут уже с новой суммы.
 * Поэтому нельзя просто взять «баланс × ставку ÷ 12» — нужно пройти период
 * день за днём, подкладывая операции по датам.
 *
 * Базой берём фактическое число дней в году: в високосном 366, как в договоре
 * «actual/365(366)».
 */

type ToWallet = (amount: number, currency: CurrencyCode) => number;

/** Насколько операция двигает баланс копилки, в её валюте. */
function delta(wallet: Wallet, t: Transaction, toWallet: ToWallet): number {
  const value = () => toWallet(Number(t.amount), t.currency);
  if (t.type === "allocation" && t.wallet_id === wallet.id) return value();
  if (t.type === "expense" && t.wallet_id === wallet.id) return -value();
  if (t.type === "adjustment" && t.wallet_id === wallet.id) return value();
  if (t.type === "transfer" && t.to_wallet_id === wallet.id) return value();
  if (t.type === "transfer" && t.from_wallet_id === wallet.id) return -value();
  return 0;
}

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function toISODate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Плюс месяц с прижатием к концу: 31 января + месяц = 28 (или 29) февраля. */
export function addMonths(date: Date, count: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + count, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

function daysInYear(date: Date): number {
  const year = date.getFullYear();
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/**
 * Проценты за период [from, to): from включительно, to — нет.
 * Пробегаем по дням, поэтому пополнение в середине периода учитывается
 * ровно с того дня, когда оно случилось.
 */
export function interestBetween(
  wallet: Wallet,
  transactions: Transaction[],
  toWallet: ToWallet,
  from: Date,
  to: Date,
): number {
  const rate = Number(wallet.rate ?? 0);
  if (!(rate > 0) || to <= from) return 0;

  const moves = transactions
    .map((t) => ({ at: new Date(t.occurred_at).getTime(), value: delta(wallet, t, toWallet) }))
    .filter((m) => m.value !== 0)
    .sort((a, b) => a.at - b.at);

  let balance = Number(wallet.initial_balance ?? 0);
  let next = 0;
  // всё, что было до начала периода, уже сидит в балансе
  while (next < moves.length && moves[next].at < from.getTime()) balance += moves[next++].value;

  let total = 0;
  // День отсчитываем календарно, а не прибавляя 86400000: иначе перевод
  // часов в странах, где он есть, сдвинул бы границы суток.
  for (const day = new Date(from); day < to; day.setDate(day.getDate() + 1)) {
    const dayEnd = new Date(day);
    dayEnd.setDate(dayEnd.getDate() + 1);
    while (next < moves.length && moves[next].at < dayEnd.getTime()) balance += moves[next++].value;
    if (balance > 0) total += (balance * rate) / 100 / daysInYear(day);
  }
  return Math.round(total * 100) / 100;
}

/** С какого дня капают проценты: с последнего начисления, иначе со дня открытия. */
export function accrualStart(wallet: Wallet): Date | null {
  return parseDate(wallet.interest_through) ?? parseDate(wallet.opened_on);
}

/**
 * Готовое к начислению: полный месяц с прошлого раза уже прошёл.
 * Раз в месяц, в то же число — так капитализируют банки, и так начисление
 * не мозолит глаза каждый день.
 */
export function pendingAccrual(
  wallet: Wallet,
  transactions: Transaction[],
  toWallet: ToWallet,
  today = startOfToday(),
): { from: Date; to: Date; amount: number } | null {
  const rate = Number(wallet.rate ?? 0);
  if (!(rate > 0)) return null;
  const from = accrualStart(wallet);
  if (!from) return null;

  let to = addMonths(from, 1);
  const term = parseDate(wallet.term_end);
  // Вклад закрылся раньше срока начисления — доначисляем по дату закрытия.
  if (term && term < to) to = term;
  if (to <= from || to > today) return null;

  const amount = interestBetween(wallet, transactions, toWallet, from, to);
  if (amount < 0.01) return null;
  return { from, to, amount };
}

/**
 * Все созревшие периоды разом: приложение могли не открывать полгода, и
 * жать кнопку шесть раз никто не станет. Каждый следующий месяц считается
 * уже с учётом процентов за предыдущий — то есть с капитализацией.
 */
export function maturedAccruals(
  wallet: Wallet,
  transactions: Transaction[],
  toWallet: ToWallet,
  today = startOfToday(),
): { from: Date; to: Date; amount: number }[] {
  const list: { from: Date; to: Date; amount: number }[] = [];
  let state = wallet;
  let history = transactions;

  // ста месяцев хватит любому вкладу, а бесконечный цикл исключён
  for (let step = 0; step < 100; step += 1) {
    const due = pendingAccrual(state, history, toWallet, today);
    if (!due) break;
    list.push(due);
    state = { ...state, interest_through: toISODate(due.to) };
    history = [
      ...history,
      {
        id: `accrual-${step}`,
        type: "allocation",
        amount: due.amount,
        currency: wallet.currency,
        category_id: null,
        wallet_id: wallet.id,
        from_wallet_id: null,
        to_wallet_id: null,
        parent_id: null,
        occurred_at: due.to.toISOString(),
        note: null,
      },
    ];
  }
  return list;
}

/** Сколько накапало с последнего начисления по вчера — просто чтобы видеть. */
export function accruedSoFar(
  wallet: Wallet,
  transactions: Transaction[],
  toWallet: ToWallet,
  today = startOfToday(),
): number {
  const from = accrualStart(wallet);
  if (!from) return 0;
  let to = today;
  const term = parseDate(wallet.term_end);
  if (term && term < to) to = term;
  return interestBetween(wallet, transactions, toWallet, from, to);
}

/**
 * Сколько будет на вкладе к концу срока, если больше ничего не класть.
 * Идём по месяцам и капитализируем — оценка, а не выписка из банка.
 */
export function projectedAtTerm(wallet: Wallet, balance: number, today = startOfToday()): number | null {
  const term = parseDate(wallet.term_end);
  const rate = Number(wallet.rate ?? 0);
  if (!term || term <= today) return null;
  if (!(rate > 0)) return balance;

  let total = balance;
  let cursor = today;
  // не больше ста шагов — защита от вклада «до 2200 года»
  for (let step = 0; step < 100; step += 1) {
    let next = addMonths(cursor, 1);
    if (next > term) next = term;
    total += (total * rate * daysBetween(cursor, next)) / 100 / daysInYear(cursor);
    cursor = next;
    if (cursor >= term) break;
  }
  return Math.round(total * 100) / 100;
}
