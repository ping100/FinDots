/**
 * Операции с деньгами, сделанные без сети: лежат на телефоне, пока не уйдут
 * на сервер. Доход, разнос, трата (с комиссией), перевод, корректировка,
 * правка и удаление операции.
 *
 * id новых строк задаётся на телефоне заранее, поэтому повторная отправка
 * безопасна: если первая на самом деле дошла, а ответ потерялся, вторая
 * упрётся в тот же id и ничего не задвоит.
 *
 * Балансы и нераспределённый доход считает база (wallet_balances,
 * income_pools). Пока операции не отправлены, их вклад досчитываем здесь по
 * тем же правилам, что и в SQL (moneyEffects) — чтобы без сети кошельки на
 * экране сразу менялись.
 *
 * Хранилище — localStorage этого браузера: без него очередь живёт только в
 * памяти до закрытия приложения.
 */
import { convert } from "./money";
import type { CurrencyCode, ExchangeRate, Transaction, Wallet } from "./types";

export type TxRow = Transaction & { user_id: string };

export type MoneyOp =
  | { t: "insert"; rows: TxRow[] }
  | { t: "update"; id: string; patch: Partial<Transaction> }
  | { t: "delete"; id: string };

const key = (userId: string) => `dots:pending:${userId}`;

export function loadMoneyOps(userId: string): MoneyOp[] {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as (MoneyOp | TxRow[])[];
    // Раньше в очереди лежали только траты — массивом строк.
    return parsed.map((op) =>
      Array.isArray(op)
        ? { t: "insert", rows: op.map((r) => ({ ...r, from_wallet_id: r.from_wallet_id ?? null, to_wallet_id: r.to_wallet_id ?? null })) }
        : op,
    );
  } catch {
    return [];
  }
}

export function saveMoneyOps(userId: string, ops: MoneyOp[]): void {
  try {
    if (ops.length) localStorage.setItem(key(userId), JSON.stringify(ops));
    else localStorage.removeItem(key(userId));
  } catch {
    // Нет хранилища — очередь остаётся в памяти.
  }
}

/** Какие строки трогает очередь: они на экране уже в новом виде. */
function touched(server: Transaction[], ops: MoneyOp[]): Set<string> {
  const ids = new Set<string>();
  for (const op of ops) {
    if (op.t === "insert") op.rows.forEach((r) => ids.add(r.id));
    else ids.add(op.id);
  }
  // Удаление уносит и «детей»: комиссию и разносы (on delete cascade).
  for (const op of ops) {
    if (op.t !== "delete") continue;
    for (const t of server) if (t.parent_id === op.id) ids.add(t.id);
  }
  return ids;
}

/** Список с сервера + очередь = то, что человек видит. */
export function applyMoneyOps(server: Transaction[], ops: MoneyOp[]): Transaction[] {
  if (!ops.length) return server;
  let list = server;
  for (const op of ops) {
    if (op.t === "insert") {
      const known = new Set(list.map((t) => t.id));
      list = [...op.rows.filter((r) => !known.has(r.id)), ...list];
    } else if (op.t === "update") {
      list = list.map((t) => (t.id === op.id ? { ...t, ...op.patch } : t));
    } else {
      list = list.filter((t) => t.id !== op.id && t.parent_id !== op.id);
    }
  }
  return [...list].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export interface Effects {
  /** Изменение баланса кошелька, в его валюте. */
  wallets: Map<string, number>;
  /** Изменение нераспределённого дохода: ключ «категория|валюта». */
  pools: Map<string, number>;
}

/**
 * Вклад очереди в балансы и «нераспределённое» — разница «стало − было»
 * по затронутым строкам. Правила те же, что во view wallet_balances и
 * income_pools: у долга (debt_out) знак обратный, корректировка — без знака.
 */
export function moneyEffects(
  server: Transaction[],
  final: Transaction[],
  ops: MoneyOp[],
  wallets: Wallet[],
  rates: ExchangeRate[],
): Effects {
  const out: Effects = { wallets: new Map(), pools: new Map() };
  if (!ops.length) return out;
  const byWallet = new Map(wallets.map((w) => [w.id, w]));
  const before = new Map(server.map((t) => [t.id, t]));
  const after = new Map(final.map((t) => [t.id, t]));

  const addWallet = (id: string | null, amount: number, currency: CurrencyCode, k: number, signed: boolean) => {
    const w = id ? byWallet.get(id) : undefined;
    if (!w) return;
    const sign = signed ? (w.kind === "debt_out" ? -1 : 1) : 1;
    const v = convert(Number(amount), currency, w.currency, rates) * sign * k;
    out.wallets.set(w.id, (out.wallets.get(w.id) ?? 0) + v);
  };
  const addPool = (category: string | null, currency: CurrencyCode, v: number) => {
    if (!category) return;
    const key = `${category}|${currency}`;
    out.pools.set(key, (out.pools.get(key) ?? 0) + v);
  };
  const apply = (t: Transaction | undefined, lookup: Map<string, Transaction>, k: number) => {
    if (!t) return;
    switch (t.type) {
      case "allocation": {
        addWallet(t.wallet_id, t.amount, t.currency, k, true);
        const parent = t.parent_id ? lookup.get(t.parent_id) : undefined;
        if (parent) addPool(parent.category_id, parent.currency, -convert(Number(t.amount), t.currency, parent.currency, rates) * k);
        break;
      }
      case "expense":
        addWallet(t.wallet_id, t.amount, t.currency, -k, true);
        break;
      case "transfer":
        addWallet(t.to_wallet_id, t.amount, t.currency, k, true);
        addWallet(t.from_wallet_id, t.amount, t.currency, -k, true);
        break;
      case "adjustment":
        addWallet(t.wallet_id, t.amount, t.currency, k, false);
        break;
      case "income":
        addPool(t.category_id, t.currency, Number(t.amount) * k);
        break;
    }
  };
  for (const id of touched(server, ops)) {
    apply(after.get(id), after, 1);
    apply(before.get(id), before, -1);
  }
  return out;
}

/** Обрыв связи или зависший запрос, а не отказ сервера. Safari пишет «Load failed». */
export function isNetworkError(message: string): boolean {
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|abort|timed? ?out|связь с сервером/i.test(
    message,
  );
}
