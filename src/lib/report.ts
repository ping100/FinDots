import type { Transaction } from "./types";
import { monthRange } from "./money";

export type Grouping = "day" | "week" | "month";

export interface Bucket {
  key: string;
  /** Подпись под осью — короткая, иначе метки налезают друг на друга. */
  label: string;
  /** Полная подпись для подсказки и таблицы. */
  full: string;
  income: number;
  expense: number;
}

/**
 * Серии доходов и расходов, разложенные по периодам.
 *
 * День и неделя нарезают выбранный месяц, месяц — последние 12 месяцев
 * по выбранный включительно: иначе группировка «по месяцам» внутри одного
 * месяца дала бы один столбик.
 */
export function buildBuckets(
  transactions: Transaction[],
  offset: number,
  grouping: Grouping,
  toBase: (amount: number, currency: string) => number,
): Bucket[] {
  const buckets: Bucket[] = [];
  const index = new Map<string, Bucket>();

  const push = (key: string, label: string, full: string) => {
    const bucket: Bucket = { key, label, full, income: 0, expense: 0 };
    buckets.push(bucket);
    index.set(key, bucket);
  };

  const { from, to } = monthRange(offset);

  if (grouping === "day") {
    const days = new Date(to.getTime() - 1).getDate();
    for (let day = 1; day <= days; day++) {
      push(
        String(day),
        day % 5 === 1 || day === days ? String(day) : "",
        `${day} ${from.toLocaleDateString("ru-RU", { month: "long" })}`,
      );
    }
  } else if (grouping === "week") {
    const days = new Date(to.getTime() - 1).getDate();
    for (let start = 1; start <= days; start += 7) {
      const end = Math.min(start + 6, days);
      push(String(start), `${start}–${end}`, `${start}–${end} число`);
    }
  } else {
    for (let shift = 11; shift >= 0; shift--) {
      const month = monthRange(offset - shift).from;
      const key = `${month.getFullYear()}-${month.getMonth()}`;
      const name = month.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "");
      push(
        key,
        shift % 3 === 0 || shift === 0 ? name : "",
        month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }),
      );
    }
  }

  const windowFrom = grouping === "month" ? monthRange(offset - 11).from : from;

  for (const t of transactions) {
    if (t.type !== "income" && t.type !== "expense") continue;
    const at = new Date(t.occurred_at);
    if (at < windowFrom || at >= to) continue;

    let key: string;
    if (grouping === "day") key = String(at.getDate());
    else if (grouping === "week") key = String(Math.floor((at.getDate() - 1) / 7) * 7 + 1);
    else key = `${at.getFullYear()}-${at.getMonth()}`;

    const bucket = index.get(key);
    if (!bucket) continue;
    const value = toBase(Number(t.amount), t.currency);
    if (t.type === "income") bucket.income += value;
    else bucket.expense += value;
  }

  return buckets;
}

/** Короткая подпись для оси: точные суммы живут в подсказке и в таблице. */
export function tickLabel(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")} млн`;
  if (abs >= 1000) return `${Math.round(value / 1000)} тыс`;
  return String(Math.round(value));
}
