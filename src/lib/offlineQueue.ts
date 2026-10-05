/**
 * Траты, записанные без сети: лежат на телефоне, пока не уйдут на сервер.
 *
 * Одна запись — строки, которые вставляются вместе (трата и её комиссия).
 * id у строк задаётся на телефоне заранее, поэтому повторная отправка
 * безопасна: если первая на самом деле дошла, а ответ потерялся, вторая
 * упрётся в тот же id и ничего не задвоит.
 *
 * Хранилище — localStorage этого браузера: в приватном режиме или с
 * запрещённым хранилищем его может не быть, и тогда очередь живёт только
 * в памяти до закрытия приложения.
 */

export interface PendingRow {
  id: string;
  user_id: string;
  type: "expense";
  amount: number;
  currency: string;
  category_id: string | null;
  subcategory_id: string | null;
  wallet_id: string;
  parent_id: string | null;
  note: string | null;
  occurred_at: string;
}

export type PendingOp = PendingRow[];

const key = (userId: string) => `dots:pending:${userId}`;

export function loadPending(userId: string): PendingOp[] {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as PendingOp[]) : [];
  } catch {
    return [];
  }
}

export function savePending(userId: string, ops: PendingOp[]): void {
  try {
    if (ops.length) localStorage.setItem(key(userId), JSON.stringify(ops));
    else localStorage.removeItem(key(userId));
  } catch {
    // Нет хранилища — очередь остаётся в памяти.
  }
}

/** Обрыв связи или зависший запрос, а не отказ сервера. Safari пишет «Load failed». */
export function isNetworkError(message: string): boolean {
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|abort|timed? ?out|связь с сервером/i.test(
    message,
  );
}
