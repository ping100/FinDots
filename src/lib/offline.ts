/**
 * Работа без сети: снимок данных на телефоне и очередь изменений.
 *
 * Снимок — то, что приложение загрузило в последний раз (балансы, задачи,
 * дни цикла). Лежит в IndexedDB этого браузера: без сети приложение
 * открывается и показывает его. Очередь — изменения, сделанные без сети;
 * уходят на сервер, как только связь вернётся.
 *
 * Всё это — данные одного человека на его телефоне. При выходе из учётной
 * записи стирается целиком (clearOffline), чтобы на общем устройстве не
 * осталось чужих денег или данных цикла.
 *
 * Без хранилища (приватный режим, запрет сайта) всё тихо работает как
 * раньше: снимка нет, очередь живёт в памяти до закрытия.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const DB = "dots-offline";
const STORE = "kv";
const LAST_USER = "dots:lastUser";
const OUTBOX_PREFIX = "dots:outbox:";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
      t.oncomplete = () => db.close();
    } catch {
      resolve(null);
    }
  });
}

/** Снимок приложения для этого человека: app — "money" | "tasks" | "fem". */
export async function readSnapshot<T>(app: string, userId: string): Promise<T | null> {
  return tx<T>("readonly", (s) => s.get(`${app}:${userId}`) as IDBRequest<T>);
}

export async function writeSnapshot(app: string, userId: string, data: unknown): Promise<void> {
  try {
    localStorage.setItem(LAST_USER, userId);
  } catch {
    // Не запомнили — без сети просто не будет снимка.
  }
  await tx("readwrite", (s) => s.put(data, `${app}:${userId}`));
}

/** Кто входил последним — чтобы без сети найти его снимок, даже если сессия не читается. */
export function lastUser(): string | null {
  try {
    return localStorage.getItem(LAST_USER);
  } catch {
    return null;
  }
}

/** Вышли из учётной записи — стереть с телефона всё: снимки, очереди, страницы. */
export async function clearOffline(): Promise<void> {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(OUTBOX_PREFIX) || k === LAST_USER || k === "dots:wellness" || k.startsWith("dots:pending:") || k.startsWith("dots:weather:")))
        localStorage.removeItem(k);
    }
  } catch {
    // Нет хранилища — и стирать нечего.
  }
  await tx("readwrite", (s) => s.clear());
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "clear-pages" });
  } catch {
    // Нет worker — нет и сохранённых страниц.
  }
}

// ───────────────────────────── очередь ─────────────────────────────

/** Одно изменение, отложенное до связи. Строки с id, заданным на телефоне. */
export type OutOp =
  | { t: "upsert"; table: string; rows: Record<string, unknown>[]; onConflict?: string }
  | { t: "update"; table: string; match: Record<string, string | number>; patch: Record<string, unknown> }
  | { t: "delete"; table: string; match: Record<string, string | number> }
  | { t: "rpc"; fn: string; args: Record<string, unknown> };

export function loadOutbox(app: string, userId: string): OutOp[] {
  try {
    const raw = localStorage.getItem(`${OUTBOX_PREFIX}${app}:${userId}`);
    return raw ? (JSON.parse(raw) as OutOp[]) : [];
  } catch {
    return [];
  }
}

export function saveOutbox(app: string, userId: string, ops: OutOp[]): void {
  try {
    const key = `${OUTBOX_PREFIX}${app}:${userId}`;
    if (ops.length) localStorage.setItem(key, JSON.stringify(ops));
    else localStorage.removeItem(key);
  } catch {
    // Нет хранилища — очередь в памяти.
  }
}

/** Выполнить одно изменение на сервере. Повтор безопасен: id заданы заранее. */
export async function runOp(client: SupabaseClient, op: OutOp): Promise<{ error: { message: string } | null }> {
  if (op.t === "rpc") return client.rpc(op.fn, op.args);
  const q = client.from(op.table);
  if (op.t === "upsert") return q.upsert(op.rows, { onConflict: op.onConflict ?? "id" });
  if (op.t === "update") return q.update(op.patch).match(op.match);
  return q.delete().match(op.match);
}

/** Обрыв связи или зависший запрос, а не отказ сервера. Safari пишет «Load failed». */
export function isNetworkError(message: string): boolean {
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|abort|timed? ?out|связь с сервером/i.test(
    message,
  );
}

export const online = () => typeof navigator === "undefined" || navigator.onLine;
