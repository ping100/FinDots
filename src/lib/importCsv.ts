import { parseDate, parseNumber } from "./csv";

/**
 * Сопоставление колонок чужого файла с нашими полями.
 *
 * Угадываем по заголовкам, но последнее слово всегда за человеком: у каждой
 * программы свои названия, и молча импортировать не то — хуже, чем спросить.
 */
export type Column =
  | "date" | "amount" | "type" | "category" | "subcategory" | "wallet" | "currency" | "note";

export const COLUMNS: { id: Column; label: string; hint: string }[] = [
  { id: "date", label: "Дата", hint: "обязательно" },
  { id: "amount", label: "Сумма", hint: "обязательно" },
  { id: "type", label: "Тип", hint: "расход или доход; без неё — по знаку суммы" },
  { id: "category", label: "Категория", hint: "чего нет — заведём" },
  { id: "subcategory", label: "Подкатегория", hint: "необязательно" },
  { id: "wallet", label: "Кошелёк", hint: "чего нет — заведём" },
  { id: "currency", label: "Валюта", hint: "пусто — основная" },
  { id: "note", label: "Комментарий", hint: "необязательно" },
];

const HINTS: Record<Column, string[]> = {
  date: ["дата", "date", "время", "datetime", "когда", "day"],
  amount: ["сумма", "amount", "value", "сум", "total", "деньги", "price"],
  type: ["тип", "type", "вид", "операция", "kind", "direction"],
  category: ["категория", "category", "статья", "cat"],
  subcategory: ["подкатегория", "subcategory", "уточнение", "subcat"],
  wallet: ["кошелёк", "кошелек", "счёт", "счет", "account", "wallet", "карта", "card"],
  currency: ["валюта", "currency", "cur"],
  note: ["комментарий", "коммент", "note", "описание", "description", "примечание", "memo"],
};

export type Mapping = Partial<Record<Column, number>>;

export function guessMapping(headers: string[]): Mapping {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const mapping: Mapping = {};
  const taken = new Set<number>();

  for (const column of COLUMNS) {
    const index = normalized.findIndex(
      (header, i) =>
        !taken.has(i) && HINTS[column.id].some((word) => header.includes(word)),
    );
    if (index >= 0) {
      mapping[column.id] = index;
      taken.add(index);
    }
  }
  return mapping;
}

export interface Draft {
  at: Date;
  amount: number;
  kind: "income" | "expense";
  category: string;
  subcategory: string;
  wallet: string;
  currency: string;
  note: string;
}

const INCOME_WORDS = ["доход", "income", "поступление", "зачисление", "credit", "приход", "+"];
const EXPENSE_WORDS = ["расход", "трата", "expense", "списание", "debit", "withdraw", "покупка", "-"];

/** Строки файла → черновики операций. Что разобрать не вышло — в пропуски. */
export function buildDrafts(
  rows: string[][],
  mapping: Mapping,
  baseCurrency: string,
  hasHeader: boolean,
): { drafts: Draft[]; skipped: number } {
  const body = hasHeader ? rows.slice(1) : rows;
  const cell = (row: string[], column: Column) => {
    const index = mapping[column];
    return index == null ? "" : (row[index] ?? "").trim();
  };

  const drafts: Draft[] = [];
  let skipped = 0;

  for (const row of body) {
    const at = parseDate(cell(row, "date"));
    const raw = parseNumber(cell(row, "amount"));
    if (!at || raw == null || raw === 0) {
      skipped += 1;
      continue;
    }

    // Тип берём из своей колонки, а если её нет — по знаку суммы: в чужих
    // выгрузках расход почти всегда записан отрицательным числом.
    const typeText = cell(row, "type").toLowerCase();
    let kind: "income" | "expense" | null = null;
    if (typeText) {
      if (INCOME_WORDS.some((w) => typeText.includes(w))) kind = "income";
      else if (EXPENSE_WORDS.some((w) => typeText.includes(w))) kind = "expense";
    }
    if (!kind) kind = raw < 0 ? "expense" : "income";

    drafts.push({
      at,
      amount: Math.abs(raw),
      kind,
      category: cell(row, "category") || (kind === "income" ? "Прочий доход" : "Прочее"),
      subcategory: cell(row, "subcategory"),
      wallet: cell(row, "wallet") || "Импорт",
      currency: (cell(row, "currency") || baseCurrency).toUpperCase().slice(0, 8),
      note: cell(row, "note"),
    });
  }

  return { drafts, skipped };
}

/** Что придётся завести: показываем до импорта, чтобы не было сюрпризов. */
export function summarize(
  drafts: Draft[],
  knownCategories: { name: string; kind: string; parent_id: string | null }[],
  knownWallets: { name: string }[],
) {
  const key = (name: string) => name.trim().toLowerCase();
  const haveCategory = new Set(
    knownCategories.filter((c) => !c.parent_id).map((c) => `${c.kind}:${key(c.name)}`),
  );
  const haveWallet = new Set(knownWallets.map((w) => key(w.name)));

  const newCategories = new Set<string>();
  const newWallets = new Set<string>();
  for (const draft of drafts) {
    if (!haveCategory.has(`${draft.kind}:${key(draft.category)}`)) {
      newCategories.add(`${draft.kind}:${draft.category}`);
    }
    if (!haveWallet.has(key(draft.wallet))) newWallets.add(draft.wallet);
  }

  const income = drafts.filter((d) => d.kind === "income").length;
  return {
    income,
    expense: drafts.length - income,
    newCategories: [...newCategories].map((entry) => entry.slice(entry.indexOf(":") + 1)),
    newWallets: [...newWallets],
  };
}
