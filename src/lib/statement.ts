/**
 * Разбор банковской выписки.
 *
 * Выписки приходят PDF-ом, свёрстанным таблицей, и единственное, на что
 * можно опереться, — строка вида «дата, знак и сумма, описание». Поэтому
 * разбираем не колонки, а строки текста: так один разбор покрывает разные
 * банки, а не только тот, чей пример был под рукой.
 */

export interface StatementRow {
  at: Date;
  /** Всегда положительная; направление — в kind. */
  amount: number;
  kind: "income" | "expense";
  /** Что было написано в выписке: «Покупка», «Перевод», «Пополнение». */
  operation: string;
  /** Кому или за что — это и станет комментарием операции. */
  detail: string;
  currency: string;
}

const CURRENCY: Record<string, string> = {
  "₸": "KZT", "тг": "KZT", "kzt": "KZT",
  "₽": "RUB", "руб": "RUB", "rub": "RUB",
  "$": "USD", "usd": "USD",
};

// Дата, знак, сумма, валюта и всё остальное. Минус бывает трёх видов:
// дефис, минус и тире — банки печатают по-разному.
const LINE =
  /^(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4})\s+([+\-−–])\s*([\d\s  ]+(?:[.,]\d{1,2})?)\s*(₸|₽|\$|тг|руб|KZT|RUB|USD)?\s*(.*)$/i;

/** Первое слово строки — тип операции, если банк его печатает. */
const OPERATIONS = [
  "покупка", "перевод", "пополнение", "снятие", "зачисление", "оплата",
  "возврат", "комиссия", "разное", "платёж", "платеж",
];

function parseAmount(raw: string): number | null {
  const text = raw.replace(/[\s  ]/g, "").replace(",", ".");
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseDate(raw: string): Date | null {
  const [d, m, y] = raw.split(/[.\-/]/).map(Number);
  if (!d || !m || !y) return null;
  // Год из двух цифр: выписки за прошлый век нам не принесут.
  const year = y < 100 ? 2000 + y : y;
  const date = new Date(year, m - 1, d, 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseStatement(lines: string[], fallbackCurrency: string): StatementRow[] {
  const rows: StatementRow[] = [];

  for (const line of lines) {
    const match = LINE.exec(line.trim());
    if (!match) continue;

    const [, rawDate, sign, rawAmount, rawCurrency, rest] = match;
    const at = parseDate(rawDate);
    const amount = parseAmount(rawAmount);
    if (!at || !amount) continue;

    // Хвост строки: сначала тип операции, потом кому или за что.
    const words = rest.trim().split(/\s+/);
    const first = (words[0] ?? "").toLowerCase().replace(/[^а-яёa-z]/gi, "");
    const known = OPERATIONS.includes(first);

    rows.push({
      at,
      amount,
      kind: sign === "+" ? "income" : "expense",
      operation: known ? words[0] : "",
      detail: (known ? words.slice(1).join(" ") : rest).trim(),
      currency: rawCurrency ? (CURRENCY[rawCurrency.toLowerCase()] ?? fallbackCurrency) : fallbackCurrency,
    });
  }

  return rows;
}

/** Период выписки — по крайним датам найденных операций. */
export function statementPeriod(rows: StatementRow[]): { from: Date; to: Date } | null {
  if (!rows.length) return null;
  const times = rows.map((r) => r.at.getTime());
  return { from: new Date(Math.min(...times)), to: new Date(Math.max(...times)) };
}
