import type { CurrencyCode, ExchangeRate } from "./types";

export const CURRENCIES: { code: CurrencyCode; symbol: string; name: string }[] = [
  { code: "KZT", symbol: "₸", name: "Тенге" },
  { code: "RUB", symbol: "₽", name: "Рубль" },
  { code: "USD", symbol: "$", name: "Доллар" },
];

export function symbolOf(code: CurrencyCode): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

/**
 * Перевод суммы между валютами по курсам пользователя.
 * rate_to_base — сколько базовой валюты стоит одна единица code.
 */
export function convert(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: ExchangeRate[],
): number {
  if (from === to) return amount;
  const rate = (code: CurrencyCode) =>
    rates.find((r) => r.code === code)?.rate_to_base ?? 1;
  const target = rate(to);
  if (!target) return amount;
  return (amount * rate(from)) / target;
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  const rounded = Math.round(amount * 100) / 100;
  const fractionDigits = Number.isInteger(rounded) ? 0 : 2;
  return (
    rounded.toLocaleString("ru-RU", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }) + " " + symbolOf(currency)
  );
}

/** Компактная запись для подписи под иконкой: 1 250 000 → 1,25 млн */
export function formatCompact(amount: number, currency: CurrencyCode): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    return (amount / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(".", ",") +
      " млн " + symbolOf(currency);
  }
  if (abs >= 10_000) {
    return Math.round(amount / 1000).toLocaleString("ru-RU") + " тыс " + symbolOf(currency);
  }
  return formatMoney(amount, currency);
}

export function parseAmount(input: string): number | null {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function monthKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(offset = 0): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { from, to };
}

/** «сентябрь» или «сентябрь 2025», без хвоста « г.» из локали. */
export function monthLabel(offset = 0, withYear = false): string {
  const { from } = monthRange(offset);
  const name = from.toLocaleDateString("ru-RU", { month: "long" });
  const sameYear = from.getFullYear() === new Date().getFullYear();
  return withYear || !sameYear ? `${name} ${from.getFullYear()}` : name;
}
