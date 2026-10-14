import { toISODate } from "./savings";
import type { Category, CurrencyCode, Transaction, Wallet } from "./types";

/**
 * «Можно тратить сегодня» — общий расчёт для шапки Findots и сводки на
 * главной Dots:
 *
 *   (деньги в кошельках − обязательные платежи до конца месяца) ÷ дней осталось
 *
 * Считается от текущих балансов, поэтому сама себя выправляет: перебрал
 * сегодня — завтрашняя цифра станет меньше. Нужны операции только этого
 * месяца.
 */
export function computeAllowance({
  wallets,
  categories,
  transactions,
  balanceOf,
  toBase,
}: {
  wallets: Wallet[];
  categories: Category[];
  transactions: Transaction[];
  balanceOf: (walletId: string) => number;
  toBase: (amount: number, currency: CurrencyCode) => number;
}) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysInMonth = new Date(monthEnd.getTime() - 1).getDate();
  const daysLeft = daysInMonth - now.getDate() + 1;

  const live = wallets.filter((w) => !w.archived);
  const of = (kind: string) =>
    live
      .filter((w) => w.kind === kind)
      .reduce((sum, w) => sum + toBase(balanceOf(w.id), w.currency), 0);

  const money = of("cash") + of("card");
  const saved = of("savings");
  // Остаток по долгам и кредитам — показываем рядом, но из баланса не
  // вычитаем: «сколько у меня денег» и «сколько я должен» — разные вопросы.
  const owed = of("debt_out");

  // Обязательства этого месяца, которые ещё впереди: либо регулярный
  // платёж, чьё число не прошло, либо долг со сроком внутри остатка месяца.
  const upcoming: { name: string; amount: number }[] = [];
  for (const wallet of wallets) {
    if (wallet.archived || wallet.kind !== "debt_out") continue;

    if (wallet.is_recurring && wallet.recurring_day != null && wallet.monthly_payment) {
      if (wallet.recurring_day >= now.getDate()) {
        // Платёж за этот месяц уже мог уйти («Внести платёж» раньше срока) —
        // тогда деньги уже списаны с баланса, и резервировать их ещё раз
        // не нужно: иначе «можно тратить» дважды теряет одну и ту же сумму.
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const paidThisMonth = transactions.reduce((sum, t) => {
          if (t.type !== "transfer" || t.to_wallet_id !== wallet.id) return sum;
          const at = new Date(t.occurred_at);
          if (at < monthStart || at >= monthEnd) return sum;
          return sum + toBase(Number(t.amount), t.currency);
        }, 0);
        const remaining = toBase(wallet.monthly_payment, wallet.currency) - paidThisMonth;
        if (remaining > 0.5) upcoming.push({ name: wallet.name, amount: remaining });
      }
      continue;
    }

    if (wallet.due_date) {
      const due = new Date(wallet.due_date);
      if (due >= today && due < monthEnd) {
        const left = toBase(balanceOf(wallet.id), wallet.currency);
        if (left > 0) upcoming.push({ name: wallet.name, amount: left });
      }
    }
  }

  // Регулярные траты: аренда, подписки. Из свободных денег держим в
  // стороне только неоплаченный остаток — заплатил половину, половина и
  // вернётся в доступные.
  const spentByCategory = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "expense" || !t.category_id) continue;
    const at = new Date(t.occurred_at);
    if (at < new Date(now.getFullYear(), now.getMonth(), 1) || at >= monthEnd) continue;
    spentByCategory.set(
      t.category_id,
      (spentByCategory.get(t.category_id) ?? 0) + toBase(Number(t.amount), t.currency),
    );
  }
  const thisMonth = toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  for (const category of categories) {
    if (category.archived || category.kind !== "expense" || !category.planned_amount) continue;
    // Отметили «уже оплачено» вручную — например, занесли трату позже или
    // заплатили вне приложения. Следующий месяц метка не действует.
    if (category.paid_month === thisMonth) continue;
    const left = Number(category.planned_amount) - (spentByCategory.get(category.id) ?? 0);
    if (left > 0.5) upcoming.push({ name: category.name, amount: left });
  }

  const obligations = upcoming.reduce((sum, item) => sum + item.amount, 0);
  const free = money - obligations;

  const spentToday = transactions.reduce((sum, t) => {
    if (t.type !== "expense") return sum;
    const at = new Date(t.occurred_at);
    if (at < today || at >= monthEnd) return sum;
    if (at.getDate() !== now.getDate()) return sum;
    return sum + toBase(Number(t.amount), t.currency);
  }, 0);

  // Траты по дням этого месяца — для мини-графика под карточкой.
  const daily = new Array<number>(daysInMonth).fill(0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const at = new Date(t.occurred_at);
    if (at < monthStart || at >= monthEnd) continue;
    daily[at.getDate() - 1] += toBase(Number(t.amount), t.currency);
  }
  const spentSoFar = daily.slice(0, now.getDate()).reduce((a, b) => a + b, 0);

  return {
    daily,
    dayOfMonth: now.getDate(),
    daysInMonth,
    avg: spentSoFar / now.getDate(),
    money,
    saved,
    owed,
    total: money + saved,
    obligations,
    upcoming,
    daysLeft,
    spentToday,
    perDay: free / Math.max(daysLeft, 1),
    short: free < 0,
  };
}

export type Allowance = ReturnType<typeof computeAllowance>;
