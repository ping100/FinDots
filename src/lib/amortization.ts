import type { Wallet } from "./types";

export interface AmortizationRow {
  /** Порядковый номер платежа, с 1. */
  n: number;
  date: string;
  payment: number;
  interest: number;
  principal: number;
  /** Остаток долга после этого платежа. */
  balance: number;
}

/** Месяцев от сегодня до даты, с округлением вверх — хотя бы 1. */
function monthsUntil(date: Date, today: Date): number {
  const months =
    (date.getFullYear() - today.getFullYear()) * 12 + (date.getMonth() - today.getMonth());
  return Math.max(1, months + (date.getDate() >= today.getDate() ? 0 : 1));
}

/**
 * Полный график платежей по кредиту от текущего остатка до даты погашения.
 * Нужны ставка (`rate`, % годовых) и `due_date` — без них график не
 * посчитать: неизвестно, за сколько платежей нужно управиться.
 */
export function buildSchedule(wallet: Wallet, remaining: number): AmortizationRow[] | null {
  if (!wallet.due_date || remaining <= 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(wallet.due_date);
  if (dueDate <= today) return null;

  const months = monthsUntil(dueDate, today);
  const monthlyRate = (wallet.rate ?? 0) / 100 / 12;
  const method = wallet.amortization_method ?? "annuity";
  const day = wallet.recurring_day ?? today.getDate();

  const rows: AmortizationRow[] = [];
  let balance = remaining;

  const payment =
    method === "annuity"
      ? monthlyRate === 0
        ? remaining / months
        : (remaining * monthlyRate * (1 + monthlyRate) ** months) /
          ((1 + monthlyRate) ** months - 1)
      : null;
  const principalPortion = method === "equal" ? remaining / months : null;

  for (let i = 1; i <= months; i++) {
    const interest = balance * monthlyRate;
    const principal =
      method === "annuity" ? (payment as number) - interest : (principalPortion as number);
    const paid = method === "annuity" ? (payment as number) : principal + interest;
    balance = Math.max(0, balance - principal);

    const date = new Date(today.getFullYear(), today.getMonth() + i, day);
    rows.push({ n: i, date: date.toISOString().slice(0, 10), payment: paid, interest, principal, balance });
  }

  return rows;
}
