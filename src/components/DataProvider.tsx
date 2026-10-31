"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FEE_LABEL } from "@/lib/fee";
import {
  applyMoneyOps,
  isNetworkError,
  loadMoneyOps,
  moneyEffects,
  saveMoneyOps,
  type MoneyOp,
  type TxRow,
} from "@/lib/offlineQueue";
import { lastUser, online, readSnapshot, writeSnapshot } from "@/lib/offline";
import { createClient } from "@/lib/supabase/client";
import { PALETTE } from "@/lib/icons";
import { CURRENCIES, convert } from "@/lib/money";
import type { Draft } from "@/lib/importCsv";
import { maturedAccruals, toISODate } from "@/lib/savings";
import { scaleFactor } from "@/lib/textScale";
import { applyLook } from "@/lib/look";
import { useMoneyHidden } from "@/lib/privacy";
import type {
  Category,
  CurrencyCode,
  ExchangeRate,
  IncomePool,
  Profile,
  Transaction,
  Wallet,
  WalletBalance,
} from "@/lib/types";

/** Когда и к какой основной валюте последний раз подтянули курс. */
export const RATES_KEY = "dots.rates.synced";

export interface Store {
  ready: boolean;
  /** Суммы скрыты «глазком». Здесь — чтобы переключение перерисовало все экраны. */
  moneyHidden: boolean;
  error: string | null;
  userId: string | null;
  profile: Profile | null;
  rates: ExchangeRate[];
  wallets: Wallet[];
  categories: Category[];
  balances: WalletBalance[];
  pools: IncomePool[];
  transactions: Transaction[];
  /** Траты, записанные без сети и ещё не ушедшие на сервер. */
  pendingCount: number;

  balanceOf: (walletId: string) => number;
  poolOf: (categoryId: string) => { amount: number; currency: CurrencyCode };
  toBase: (amount: number, currency: CurrencyCode) => number;

  refresh: () => Promise<void>;

  addIncome: (args: {
    categoryId: string;
    subcategoryId?: string | null;
    amount: number;
    currency: CurrencyCode;
    note?: string;
    occurredAt?: string;
  }) => Promise<void>;
  allocate: (args: {
    categoryId: string;
    walletId: string;
    amount: number;
    currency: CurrencyCode;
  }) => Promise<void>;
  addExpense: (args: {
    categoryId: string;
    subcategoryId?: string | null;
    walletId: string;
    amount: number;
    currency: CurrencyCode;
    note?: string;
    occurredAt?: string;
    /** Комиссия банка или сервиса — спишется с того же кошелька отдельной строкой. */
    fee?: number;
  }) => Promise<void>;
  addTransfer: (args: {
    fromWalletId: string;
    toWalletId: string;
    amount: number;
    currency: CurrencyCode;
    note?: string;
    occurredAt?: string;
    /** Комиссия за перевод — спишется с кошелька-источника отдельной строкой. */
    fee?: number;
  }) => Promise<void>;
  setWalletBalance: (walletId: string, target: number) => Promise<void>;
  /**
   * Добавить к долгу сумму без кошелька: старый долг, деньги давно
   * потрачены или отданы. Пишется корректировкой с подписью и датой.
   */
  addToDebt: (walletId: string, amount: number, note: string, occurredAt?: string) => Promise<void>;
  /** Записать созревшие проценты по вкладу. Возвращает начисленную сумму. */
  accrueInterest: (walletId: string) => Promise<number>;

  updateTransaction: (id: string, patch: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  /** Возвращает id кошелька — нового или того же. */
  saveWallet: (wallet: Partial<Wallet> & { id?: string }) => Promise<string>;
  deleteWallet: (id: string) => Promise<void>;
  saveCategory: (category: Partial<Category> & { id?: string }) => Promise<void>;
  /** Новый порядок кружков: id в том порядке, в каком их показывать. */
  reorderCategories: (orderedIds: string[]) => Promise<void>;
  /** Завести подкатегорию внутри категории; возвращает её id. */
  addSubcategory: (parentId: string, name: string) => Promise<string>;
  /** Загрузить операции из чужой выгрузки; сообщает о ходе работы. */
  importDrafts: (
    drafts: Draft[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<{ added: number; categories: number; wallets: number }>;
  deleteCategory: (id: string) => Promise<void>;
  /** Удаляет все операции, кошельки и категории насовсем — чистый лист. */
  resetMoneyData: () => Promise<void>;

  saveProfile: (patch: Partial<Profile>) => Promise<void>;
  saveRate: (code: CurrencyCode, rate: number) => Promise<void>;
  /** Подтянуть официальный курс сейчас. Возвращает дату курса и источник. */
  syncRates: () => Promise<{ date: string; source: "nbk" | "open" }>;
}

/**
 * Ошибки, которые проходят сами со второй попытки.
 *
 * «JWT issued at future» — рассинхрон внутри Supabase: токен выдаёт один
 * сервис, а проверяет база, и на секунду их часы расходятся. Часы телефона
 * тут ни при чём, чинить нечего — надо просто повторить запрос.
 */
function transient(message: string): boolean {
  return /jwt|token is expired|failed to fetch|load failed|network|fetch failed/i.test(message);
}

/** Техническую строку от сервера человеку показывать незачем. */
function human(message: string): string {
  if (transient(message)) return "Связь с сервером сорвалась — пробую ещё раз";
  if (/row-level security|permission denied/i.test(message)) {
    return "Нет доступа к этим данным — попробуйте войти заново";
  }
  return message;
}

/** Снимок денег на телефоне — чтобы без сети приложение открывалось с последними данными. */
interface MoneySnapshot {
  profile: Profile | null;
  rates: ExchangeRate[];
  wallets: Wallet[];
  categories: Category[];
  balances: WalletBalance[];
  pools: IncomePool[];
  transactions: Transaction[];
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore вызван вне DataProvider");
  return store;
}

export function DataProvider({ children }: { children: ReactNode }) {
  // Клиент создаётся лениво: при серверном рендере окружения браузера нет,
  // а ключи Supabase могут быть не заданы на этапе сборки.
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const supabase = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }, []);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [pools, setPools] = useState<IncomePool[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  // Операции без сети (lib/offlineQueue): на экране уже есть, на сервер уйдут при связи.
  const [pending, setPending] = useState<MoneyOp[]>([]);
  const pendingRef = useRef<MoneyOp[]>([]);
  pendingRef.current = pending;

  const load = useCallback(async (retry = true) => {
    // Кто вошёл — из сохранённой сессии, без запроса к серверу входа:
    // proxy уже проверил вход по пути сюда, а доступ к строкам всё равно
    // решает база. Лишний круг до сервера — это полсекунды на мобильном.
    const {
      data: { session },
    } = await supabase()
      .auth.getSession()
      .catch(() => ({ data: { session: null } }));
    // Без сети сессия может не прочитаться (истёк токен) — тогда тот, кто входил последним.
    const uid = session?.user?.id ?? (online() ? null : lastUser());
    if (!uid) {
      setReady(true);
      return;
    }
    const user = { id: uid };
    setUserId(user.id);

    // Без сети — последнее загруженное, с телефона.
    const fromSnapshot = async () => {
      const snap = await readSnapshot<MoneySnapshot>("money", uid);
      if (snap) {
        setProfile(snap.profile);
        setRates(snap.rates);
        setWallets(snap.wallets);
        setCategories(snap.categories);
        setBalances(snap.balances);
        setPools(snap.pools);
        setTransactions(snap.transactions);
        setError(null);
      }
      setReady(true);
      return !!snap;
    };
    if (!online()) {
      await fromSnapshot();
      return;
    }

    const [p, r, w, c, b, ip, tx] = await Promise.all([
      supabase().from("profiles").select("*").eq("id", user.id).single(),
      supabase().from("exchange_rates").select("code, rate_to_base, updated_at"),
      // Архивные тоже: операция по убранной категории иначе теряет название
      // и показывается в истории прочерком. Экраны сами прячут archived.
      supabase().from("wallets").select("*").order("sort_order"),
      supabase().from("categories").select("*").order("sort_order"),
      supabase().from("wallet_balances").select("wallet_id, currency, balance"),
      supabase().from("income_pools").select("category_id, currency, unallocated"),
      supabase()
        .from("transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(5000),
    ]);

    const firstError = [p, r, w, c, b, ip, tx].find((res) => res.error)?.error;
    if (firstError && isNetworkError(firstError.message) && (await fromSnapshot())) return;
    if (firstError && transient(firstError.message) && retry) {
      // Сорвавшийся токен обновляем и заходим на второй круг: показывать
      // человеку «JWT issued at future» и оставлять пустой экран — худшее,
      // что можно сделать с ошибкой, которая проходит сама.
      await supabase().auth.refreshSession();
      await new Promise((done) => setTimeout(done, 600));
      return load(false);
    }
    if (firstError) setError(human(firstError.message));
    else setError(null);

    if (p.data) setProfile(p.data as Profile);
    setRates((r.data ?? []) as ExchangeRate[]);
    setWallets((w.data ?? []) as Wallet[]);
    setCategories((c.data ?? []) as Category[]);
    setBalances((b.data ?? []) as WalletBalance[]);
    setPools((ip.data ?? []) as IncomePool[]);
    setTransactions((tx.data ?? []) as Transaction[]);
    setReady(true);
    if (!firstError) {
      void writeSnapshot("money", uid, {
        profile: (p.data ?? null) as Profile | null,
        rates: (r.data ?? []) as ExchangeRate[],
        wallets: (w.data ?? []) as Wallet[],
        categories: (c.data ?? []) as Category[],
        balances: (b.data ?? []) as WalletBalance[],
        pools: (ip.data ?? []) as IncomePool[],
        transactions: (tx.data ?? []) as Transaction[],
      } satisfies MoneySnapshot);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // Тема и размер шрифта живут в профиле, чтобы переезжали между
  // устройствами. Размер задаётся базовым кеглем на html: весь текст в
  // приложении описан в rem и подтягивается за ним.
  useEffect(() => {
    if (!profile) return;
    const fontSize = `${16 * scaleFactor(profile.text_scale)}px`;
    // Заодно запоминаем на устройстве, чтобы в следующий раз экран ожидания
    // открылся сразу в нужном виде, не дожидаясь профиля.
    applyLook(profile.theme, fontSize);
  }, [profile]);

  /** Пересчитать производные данные после записи. */
  const refresh = useCallback(async () => {
    const [b, ip, tx] = await Promise.all([
      supabase().from("wallet_balances").select("wallet_id, currency, balance"),
      supabase().from("income_pools").select("category_id, currency, unallocated"),
      supabase()
        .from("transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(5000),
    ]);
    // Сорвался запрос — оставляем то, что уже на экране: пустой список
    // посреди магазина без сети хуже, чем чуть устаревший.
    if (!b.error) setBalances((b.data ?? []) as WalletBalance[]);
    if (!ip.error) setPools((ip.data ?? []) as IncomePool[]);
    if (!tx.error) setTransactions((tx.data ?? []) as Transaction[]);
    if (!b.error && !ip.error && !tx.error) setSnapshotDirty((n) => n + 1);
  }, [supabase]);

  // Снимок на телефон — после каждой удачной загрузки с сервера.
  const [snapshotDirty, setSnapshotDirty] = useState(0);
  useEffect(() => {
    if (!snapshotDirty || !userId) return;
    void writeSnapshot("money", userId, { profile, rates, wallets, categories, balances, pools, transactions } satisfies MoneySnapshot);
    // Только по сигналу refresh, а не на каждую правку состояния.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotDirty]);

  const guard = useCallback(
    async (run: () => PromiseLike<{ error: { message: string } | null }>) => {
      setError(null);
      let { error: err } = await run();
      // Та же история, что и при загрузке: срыв токена лечится повтором, и
      // терять из-за него уже введённую операцию человеку не за что.
      if (err && transient(err.message)) {
        await supabase().auth.refreshSession();
        await new Promise((done) => setTimeout(done, 600));
        ({ error: err } = await run());
      }
      if (err) {
        setError(human(err.message));
        throw new Error(human(err.message));
      }
      await refresh();
    },
    [refresh, supabase],
  );

  // Операции из очереди уже в списке и в балансах: человек их сделал, а
  // сервер о них ещё не знает — досчитываем их вклад сами (lib/offlineQueue).
  const visibleTransactions = useMemo(() => applyMoneyOps(transactions, pending), [transactions, pending]);
  const effects = useMemo(
    () => moneyEffects(transactions, visibleTransactions, pending, wallets, rates),
    [transactions, visibleTransactions, pending, wallets, rates],
  );

  const balanceOf = useCallback(
    (walletId: string) =>
      Number(balances.find((b) => b.wallet_id === walletId)?.balance ?? 0) + (effects.wallets.get(walletId) ?? 0),
    [balances, effects],
  );

  // «Нераспределённый доход» с учётом очереди: доход без сети сразу виден.
  const effectivePools = useMemo(() => {
    if (!effects.pools.size) return pools;
    const map = new Map(pools.map((p) => [`${p.category_id}|${p.currency}`, { ...p, unallocated: Number(p.unallocated) }]));
    for (const [key, delta] of effects.pools) {
      const [category_id, currency] = key.split("|");
      const row = map.get(key) ?? ({ category_id, currency, unallocated: 0 } as IncomePool);
      map.set(key, { ...row, unallocated: Number(row.unallocated) + delta });
    }
    return [...map.values()].filter((p) => Number(p.unallocated) > 0.004);
  }, [pools, effects]);

  const poolOf = useCallback(
    (categoryId: string) => {
      const rows = effectivePools.filter((p) => p.category_id === categoryId);
      const currency = rows[0]?.currency ?? profile?.base_currency ?? "KZT";
      const amount = rows.reduce(
        (sum, row) => sum + convert(Number(row.unallocated), row.currency, currency, rates),
        0,
      );
      return { amount, currency };
    },
    [effectivePools, profile, rates],
  );

  const toBase = useCallback(
    (amount: number, currency: CurrencyCode) =>
      convert(amount, currency, profile?.base_currency ?? "KZT", rates),
    [profile, rates],
  );

  // ─────────────────────────── операции ───────────────────────────

  // Очередь операций без сети — у каждого вошедшего своя.
  useEffect(() => {
    if (userId) setPending(loadMoneyOps(userId));
  }, [userId]);

  // Через ref, а не функцию-обновлялку useState: отправка читает очередь в
  // цикле сразу после правки, а обновлялка выполнится позже.
  const updatePending = useCallback(
    (change: (ops: MoneyOp[]) => MoneyOp[]) => {
      const next = change(pendingRef.current);
      pendingRef.current = next;
      if (userId) saveMoneyOps(userId, next);
      setPending(next);
    },
    [userId],
  );

  /** Полная строка операции: всё, чего нет, — null. id задаём здесь. */
  const txRow = useCallback(
    (fields: Partial<Transaction> & Pick<Transaction, "type" | "amount" | "currency">): TxRow => ({
      id: crypto.randomUUID(),
      user_id: userId ?? "",
      category_id: null,
      subcategory_id: null,
      wallet_id: null,
      from_wallet_id: null,
      to_wallet_id: null,
      parent_id: null,
      note: null,
      occurred_at: new Date().toISOString(),
      ...fields,
    }),
    [userId],
  );

  const runMoneyOp = useCallback(
    (op: MoneyOp) => {
      const q = supabase().from("transactions");
      // При слабом сигнале запрос может висеть минуту — после 8 секунд
      // считаем, что связи нет, и кладём в очередь.
      const signal = AbortSignal.timeout(8000);
      if (op.t === "insert") return q.upsert(op.rows, { onConflict: "id", ignoreDuplicates: true }).abortSignal(signal);
      if (op.t === "update") return q.update(op.patch).eq("id", op.id).abortSignal(signal);
      return q.delete().eq("id", op.id).abortSignal(signal);
    },
    [supabase],
  );

  /** Записать операцию: со связью — сразу, без неё (или если связь сорвалась) — в очередь. */
  const submit = useCallback(
    async (op: MoneyOp) => {
      if (!userId) throw new Error("Нужно войти заново");
      if (!online()) {
        updatePending((ops) => [...ops, op]);
        return;
      }
      try {
        await guard(() => runMoneyOp(op));
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        if (!online() || isNetworkError(message)) {
          setError(null);
          updatePending((ops) => [...ops, op]);
          return;
        }
        throw e;
      }
    },
    [guard, runMoneyOp, updatePending, userId],
  );

  const addExpense: Store["addExpense"] = useCallback(
    async ({ categoryId, subcategoryId, walletId, amount, currency, note, occurredAt, fee }) => {
      // id задаём здесь: по нему комиссия ссылается на трату, и по нему же
      // повторная отправка из очереди не задвоит строку (lib/offlineQueue.ts).
      const expense = txRow({
        type: "expense",
        amount,
        currency,
        category_id: categoryId,
        subcategory_id: subcategoryId || null,
        wallet_id: walletId,
        note: note || null,
        occurred_at: occurredAt ?? new Date().toISOString(),
      });
      const rows = [expense];
      // Комиссия — отдельной строкой без категории (lib/fee.ts).
      if (fee && fee > 0) rows.push(txRow({ ...expense, id: crypto.randomUUID(), amount: fee, category_id: null, subcategory_id: null, parent_id: expense.id, note: FEE_LABEL }));
      // Одним запросом: трата и комиссия сохраняются вместе или никак.
      await submit({ t: "insert", rows });
    },
    [submit, txRow],
  );

  // Отправить очередь, как только есть связь.
  const flushing = useRef(false);
  const flushPending = useCallback(async () => {
    if (flushing.current || pendingRef.current.length === 0 || !online()) return;
    flushing.current = true;
    try {
      while (pendingRef.current.length) {
        const res = await runMoneyOp(pendingRef.current[0]);
        // Связь снова пропала — дождёмся следующей попытки.
        if (res.error && (transient(res.error.message) || isNetworkError(res.error.message))) break;
        // Сервер отказал по существу: крутить вечно бессмысленно — говорим.
        if (res.error) setError(`Операция, записанная без сети, не сохранилась: ${human(res.error.message)}`);
        updatePending((ops) => ops.slice(1));
      }
    } finally {
      flushing.current = false;
    }
    await refresh();
  }, [refresh, runMoneyOp, updatePending]);

  useEffect(() => {
    if (pending.length === 0) return;
    void flushPending();
    const retry = () => void flushPending();
    window.addEventListener("online", retry);
    const timer = setInterval(retry, 30_000);
    return () => {
      window.removeEventListener("online", retry);
      clearInterval(timer);
    };
  }, [pending.length, flushPending]);

  const addIncome: Store["addIncome"] = useCallback(
    async ({ categoryId, subcategoryId, amount, currency, note, occurredAt }) =>
      submit({
        t: "insert",
        rows: [
          txRow({
            type: "income",
            amount,
            currency,
            category_id: categoryId,
            subcategory_id: subcategoryId || null,
            note: note || null,
            occurred_at: occurredAt ?? new Date().toISOString(),
          }),
        ],
      }),
    [submit, txRow],
  );

  /**
   * Разнос дохода по кошелькам. Сумма списывается с самых ранних
   * нераспределённых поступлений этой категории (FIFO) и может лечь
   * на несколько строк дохода сразу — поэтому вставок может быть больше одной.
   */
  const allocate: Store["allocate"] = useCallback(
    async ({ categoryId, walletId, amount, currency }) => {
      const allocatedByParent = new Map<string, number>();
      // С очередью: доход и разносы, сделанные без сети, тоже учитываются.
      for (const t of visibleTransactions) {
        if (t.type !== "allocation" || !t.parent_id) continue;
        allocatedByParent.set(
          t.parent_id,
          (allocatedByParent.get(t.parent_id) ?? 0) + Number(t.amount),
        );
      }

      const sources = visibleTransactions
        .filter((t) => t.type === "income" && t.category_id === categoryId)
        .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
        .map((t) => ({
          tx: t,
          left: Number(t.amount) - (allocatedByParent.get(t.id) ?? 0),
        }))
        .filter((s) => s.left > 0.004);

      let remaining = amount;
      const rows: TxRow[] = [];
      for (const source of sources) {
        if (remaining <= 0.004) break;
        // остаток источника — в его валюте, переносимая сумма — в валюте переноса
        const leftInDragCurrency = convert(source.left, source.tx.currency, currency, rates);
        const take = Math.min(remaining, leftInDragCurrency);
        rows.push(
          txRow({ type: "allocation", amount: Math.round(take * 100) / 100, currency, wallet_id: walletId, parent_id: source.tx.id }),
        );
        remaining -= take;
      }

      if (!rows.length) throw new Error("Нечего переносить: нераспределённого дохода нет");
      await submit({ t: "insert", rows });
    },
    [rates, submit, txRow, visibleTransactions],
  );

  const addTransfer: Store["addTransfer"] = useCallback(
    async ({ fromWalletId, toWalletId, amount, currency, note, occurredAt, fee }) => {
      const transfer = txRow({
        type: "transfer",
        amount,
        currency,
        from_wallet_id: fromWalletId,
        to_wallet_id: toWalletId,
        note: note || null,
        occurred_at: occurredAt ?? new Date().toISOString(),
      });
      // Комиссия — как у трат (lib/fee.ts): расход без категории с parent_id
      // на перевод. Удалили перевод — база удалит и комиссию.
      const rows = [transfer];
      if (fee && fee > 0) {
        rows.push(
          txRow({ type: "expense", amount: fee, currency, wallet_id: fromWalletId, parent_id: transfer.id, note: FEE_LABEL, occurred_at: transfer.occurred_at }),
        );
      }
      // Одним запросом: перевод и комиссия сохраняются вместе или никак.
      await submit({ t: "insert", rows });
    },
    [submit, txRow],
  );

  /** Ручная правка баланса записывается отдельной операцией, а не затиранием истории. */
  const setWalletBalance: Store["setWalletBalance"] = useCallback(
    async (walletId, target) => {
      const wallet = wallets.find((w) => w.id === walletId);
      if (!wallet) throw new Error("Кошелёк не найден");
      const delta = Math.round((target - balanceOf(walletId)) * 100) / 100;
      if (Math.abs(delta) < 0.005) return;
      await submit({
        t: "insert",
        rows: [txRow({ type: "adjustment", amount: delta, currency: wallet.currency, wallet_id: walletId, note: "Ручная корректировка" })],
      });
    },
    [balanceOf, submit, txRow, wallets],
  );

  const addToDebt: Store["addToDebt"] = useCallback(
    async (walletId, amount, note, occurredAt) => {
      const wallet = wallets.find((w) => w.id === walletId);
      if (!wallet) throw new Error("Долг не найден");
      await submit({
        t: "insert",
        rows: [txRow({ type: "adjustment", amount, currency: wallet.currency, wallet_id: walletId, note, occurred_at: occurredAt ?? new Date().toISOString() })],
      });
    },
    [submit, txRow, wallets],
  );

  const reloadDictionaries = useCallback(async () => {
    const [w, c] = await Promise.all([
      supabase().from("wallets").select("*").order("sort_order"),
      supabase().from("categories").select("*").order("sort_order"),
    ]);
    setWallets((w.data ?? []) as Wallet[]);
    setCategories((c.data ?? []) as Category[]);
  }, [supabase]);

  /**
   * Проценты по вкладу прибавляются к нему напрямую, отдельной операцией —
   * без дохода в категориях и отчётах. Раньше начисление писалось парой
   * «доход + разнос», и в «Доходах» на главном экране заводилась своя
   * категория «Проценты», хотя эти деньги никуда, кроме вклада, не шли.
   *
   * Отдельного сервера с расписанием нет, так что начисление делает сам
   * пользователь одной кнопкой, когда месяц уже прошёл. Дата последнего
   * начисления живёт в кошельке, поэтому дважды за один период не начислить.
   */
  const accrueInterest: Store["accrueInterest"] = useCallback(
    async (walletId) => {
      const wallet = wallets.find((w) => w.id === walletId);
      if (!wallet) throw new Error("Вклад не найден");
      const toWallet = (amount: number, currency: CurrencyCode) =>
        convert(amount, currency, wallet.currency, rates);
      const due = maturedAccruals(wallet, transactions, toWallet);
      if (!due.length) return 0;

      // Каждый месяц — отдельной операцией: так в истории видно, за какой
      // период сколько накапало, и её можно поправить или удалить как любую.
      for (const period of due) {
        const moved = await supabase().from("transactions").insert({
          user_id: userId,
          type: "adjustment",
          amount: period.amount,
          currency: wallet.currency,
          wallet_id: wallet.id,
          note: "Проценты по вкладу",
          occurred_at: period.to.toISOString(),
        });
        if (moved.error) throw new Error(moved.error.message);
      }

      const marked = await supabase()
        .from("wallets")
        .update({ interest_through: toISODate(due[due.length - 1].to) })
        .eq("id", wallet.id);
      if (marked.error) throw new Error(marked.error.message);

      await Promise.all([reloadDictionaries(), refresh()]);
      return due.reduce((sum, period) => sum + period.amount, 0);
    },
    [rates, refresh, reloadDictionaries, supabase, transactions, userId, wallets],
  );

  /** Операция ещё не ушла на сервер — правим её прямо в очереди. */
  const queuedInsert = useCallback(
    (id: string) => pending.some((op) => op.t === "insert" && op.rows.some((row) => row.id === id)),
    [pending],
  );

  const updateTransaction: Store["updateTransaction"] = useCallback(
    async (id, patch) => {
      if (queuedInsert(id)) {
        updatePending((ops) =>
          ops.map((op) => (op.t === "insert" ? { ...op, rows: op.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)) } : op)),
        );
        return;
      }
      await submit({ t: "update", id, patch });
    },
    [queuedInsert, submit, updatePending],
  );

  const deleteTransaction: Store["deleteTransaction"] = useCallback(
    async (id) => {
      if (queuedInsert(id)) {
        // Как и на сервере, с операцией уходят её комиссия и разносы.
        updatePending((ops) =>
          ops
            .map((op) => (op.t === "insert" ? { ...op, rows: op.rows.filter((row) => row.id !== id && row.parent_id !== id) } : op))
            .filter((op) => op.t !== "insert" || op.rows.length > 0),
        );
        return;
      }
      await submit({ t: "delete", id });
    },
    [queuedInsert, submit, updatePending],
  );

  // ───────────────────── справочники ─────────────────────

  const saveWallet: Store["saveWallet"] = useCallback(
    async (wallet) => {
      const { id, ...fields } = wallet;
      const res = id
        ? await supabase().from("wallets").update(fields).eq("id", id).select("id").single()
        : await supabase().from("wallets").insert({ ...fields, user_id: userId }).select("id").single();
      if (res.error) {
        setError(res.error.message);
        throw new Error(res.error.message);
      }
      await Promise.all([reloadDictionaries(), refresh()]);
      return res.data.id as string;
    },
    [refresh, reloadDictionaries, supabase, userId],
  );

  /** Кошельки и категории не удаляем физически — история операций должна выжить. */
  const deleteWallet: Store["deleteWallet"] = useCallback(
    async (id) => {
      const res = await supabase().from("wallets").update({ archived: true }).eq("id", id);
      if (res.error) throw new Error(res.error.message);
      await Promise.all([reloadDictionaries(), refresh()]);
    },
    [refresh, reloadDictionaries, supabase],
  );

  /**
   * Полная очистка денег: операции, кошельки и категории удаляются насовсем,
   * а не архивируются, как при обычном удалении, — вернуть их неоткуда.
   * Учётная запись, вход и настройки (валюта, тема, ключ ИИ) не трогаются.
   * Порядок важен: операции ссылаются на кошельки и категории.
   */
  const resetMoneyData: Store["resetMoneyData"] = useCallback(async () => {
    if (!userId) return;
    const tx = await supabase().from("transactions").delete().eq("user_id", userId);
    if (tx.error) throw new Error(tx.error.message);
    const w = await supabase().from("wallets").delete().eq("user_id", userId);
    if (w.error) throw new Error(w.error.message);
    const c = await supabase().from("categories").delete().eq("user_id", userId);
    if (c.error) throw new Error(c.error.message);
    await Promise.all([reloadDictionaries(), refresh()]);
  }, [refresh, reloadDictionaries, supabase, userId]);

  /**
   * Подкатегория, заведённая прямо в окне траты. Возвращает её id, чтобы
   * чип сразу стал выбранным: человек нажал «+», вписал название и продолжил
   * вводить сумму, не выходя из окна.
   */
  const addSubcategory: Store["addSubcategory"] = useCallback(
    async (parentId, name) => {
      const parent = categories.find((c) => c.id === parentId);
      if (!parent) throw new Error("Категория не найдена");
      const res = await supabase()
        .from("categories")
        .insert({
          user_id: userId,
          kind: parent.kind,
          name: name.trim(),
          icon: parent.icon,
          color: parent.color,
          parent_id: parentId,
        })
        .select("*")
        .single();
      if (res.error) {
        setError(res.error.message);
        throw new Error(res.error.message);
      }
      const created = res.data as Category;
      setCategories((prev) => [...prev, created]);
      return created.id;
    },
    [categories, supabase, userId],
  );

  const saveCategory: Store["saveCategory"] = useCallback(
    async (category) => {
      const { id, ...fields } = category;
      const res = id
        ? await supabase().from("categories").update(fields).eq("id", id)
        : await supabase().from("categories").insert({ ...fields, user_id: userId });
      if (res.error) {
        setError(res.error.message);
        throw new Error(res.error.message);
      }
      await Promise.all([reloadDictionaries(), refresh()]);
    },
    [refresh, reloadDictionaries, supabase, userId],
  );

  const reorderCategories: Store["reorderCategories"] = useCallback(
    async (orderedIds) => {
      const position = new Map(orderedIds.map((id, index) => [id, index]));
      const changed = categories.filter(
        (c) => position.has(c.id) && c.sort_order !== position.get(c.id),
      );
      if (changed.length === 0) return;
      // Сразу на экране — ждать ответа базы на каждый кружок незачем.
      setCategories((list) =>
        list
          .map((c) => (position.has(c.id) ? { ...c, sort_order: position.get(c.id)! } : c))
          .sort((a, b) => a.sort_order - b.sort_order),
      );
      const results = await Promise.all(
        changed.map((c) =>
          supabase().from("categories").update({ sort_order: position.get(c.id) }).eq("id", c.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        setError(failed.error.message);
        await reloadDictionaries();
        throw new Error(failed.error.message);
      }
    },
    [categories, reloadDictionaries, supabase],
  );

  /**
   * Импорт из чужой программы.
   *
   * Недостающие кошельки и категории заводим сами — заставлять человека
   * вручную повторять список из другого приложения бессмысленно. Сверяем по
   * имени без учёта регистра, поэтому повторный импорт не плодит двойники.
   *
   * Расходы пишем пачками: их тысячи. Доход в нашей модели — это две строки
   * (поступление и разнос по кошельку), вторая ссылается на первую, поэтому
   * доходы идут по одному. Их на порядок меньше, так что на времени это
   * почти не сказывается.
   */
  const importDrafts: Store["importDrafts"] = useCallback(
    async (drafts, onProgress) => {
      if (!userId) throw new Error("Нет учётной записи");
      const key = (name: string) => name.trim().toLowerCase();

      // Архивные в сверку не берём: убранная категория не должна ожить
      // оттого, что в чужом файле встретилось её имя.
      const live = categories.filter((c) => !c.archived);
      const walletId = new Map(wallets.filter((w) => !w.archived).map((w) => [key(w.name), w.id]));
      const categoryId = new Map(
        live.filter((c) => !c.parent_id).map((c) => [`${c.kind}:${key(c.name)}`, c.id]),
      );
      const subId = new Map(
        live.filter((c) => c.parent_id).map((c) => [`${c.parent_id}:${key(c.name)}`, c.id]),
      );

      let createdWallets = 0;
      let createdCategories = 0;

      const ensureWallet = async (name: string, currency: string) => {
        const found = walletId.get(key(name));
        if (found) return found;
        const res = await supabase()
          .from("wallets")
          .insert({
            user_id: userId,
            kind: "card",
            name: name.trim(),
            icon: "card",
            color: PALETTE[walletId.size % PALETTE.length],
            currency,
          })
          .select("id")
          .single();
        if (res.error) throw new Error(res.error.message);
        const id = (res.data as { id: string }).id;
        walletId.set(key(name), id);
        createdWallets += 1;
        return id;
      };

      const ensureCategory = async (name: string, kind: "income" | "expense") => {
        const mapKey = `${kind}:${key(name)}`;
        const found = categoryId.get(mapKey);
        if (found) return found;
        const res = await supabase()
          .from("categories")
          .insert({
            user_id: userId,
            kind,
            name: name.trim(),
            icon: kind === "income" ? "briefcase" : "cart",
            color: PALETTE[categoryId.size % PALETTE.length],
          })
          .select("id")
          .single();
        if (res.error) throw new Error(res.error.message);
        const id = (res.data as { id: string }).id;
        categoryId.set(mapKey, id);
        createdCategories += 1;
        return id;
      };

      const ensureSub = async (parentId: string, name: string) => {
        if (!name.trim()) return null;
        const mapKey = `${parentId}:${key(name)}`;
        const found = subId.get(mapKey);
        if (found) return found;
        const parent = categories.find((c) => c.id === parentId);
        const res = await supabase()
          .from("categories")
          .insert({
            user_id: userId,
            kind: parent?.kind ?? "expense",
            name: name.trim(),
            icon: parent?.icon ?? "cart",
            color: parent?.color ?? PALETTE[0],
            parent_id: parentId,
          })
          .select("id")
          .single();
        if (res.error) throw new Error(res.error.message);
        const id = (res.data as { id: string }).id;
        subId.set(mapKey, id);
        return id;
      };

      const expenses: Record<string, unknown>[] = [];
      let done = 0;

      for (const draft of drafts) {
        const wallet = await ensureWallet(draft.wallet, draft.currency);
        const category = await ensureCategory(draft.category, draft.kind);
        const sub = await ensureSub(category, draft.subcategory);

        if (draft.kind === "expense") {
          expenses.push({
            user_id: userId,
            type: "expense",
            amount: draft.amount,
            currency: draft.currency,
            category_id: category,
            subcategory_id: sub,
            wallet_id: wallet,
            note: draft.note || null,
            occurred_at: draft.at.toISOString(),
          });
        } else {
          const income = await supabase()
            .from("transactions")
            .insert({
              user_id: userId,
              type: "income",
              amount: draft.amount,
              currency: draft.currency,
              category_id: category,
              subcategory_id: sub,
              note: draft.note || null,
              occurred_at: draft.at.toISOString(),
            })
            .select("id")
            .single();
          if (income.error) throw new Error(income.error.message);
          const moved = await supabase().from("transactions").insert({
            user_id: userId,
            type: "allocation",
            amount: draft.amount,
            currency: draft.currency,
            wallet_id: wallet,
            parent_id: (income.data as { id: string }).id,
            occurred_at: draft.at.toISOString(),
          });
          if (moved.error) throw new Error(moved.error.message);
        }

        done += 1;
        if (done % 25 === 0) onProgress?.(done, drafts.length);
      }

      // Пачками по 200: одним запросом на тысячи строк упирается в лимит тела.
      for (let i = 0; i < expenses.length; i += 200) {
        const res = await supabase().from("transactions").insert(expenses.slice(i, i + 200));
        if (res.error) throw new Error(res.error.message);
      }

      onProgress?.(drafts.length, drafts.length);
      await Promise.all([reloadDictionaries(), refresh()]);
      return { added: drafts.length, categories: createdCategories, wallets: createdWallets };
    },
    [categories, refresh, reloadDictionaries, supabase, userId, wallets],
  );

  const deleteCategory: Store["deleteCategory"] = useCallback(
    async (id) => {
      // Вместе с категорией убираем её подкатегории: иначе они остались бы
      // висеть в базе и всплыли бы, если категорию когда-нибудь вернуть.
      const res = await supabase()
        .from("categories")
        .update({ archived: true })
        .or(`id.eq.${id},parent_id.eq.${id}`);
      if (res.error) throw new Error(res.error.message);
      await Promise.all([reloadDictionaries(), refresh()]);
    },
    [refresh, reloadDictionaries, supabase],
  );

  const saveProfile: Store["saveProfile"] = useCallback(
    async (patch) => {
      if (!userId) return;
      const res = await supabase().from("profiles").update(patch).eq("id", userId);
      if (res.error) throw new Error(res.error.message);
      setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    [supabase, userId],
  );

  const saveRate: Store["saveRate"] = useCallback(
    async (code, rate) => {
      if (!userId) return;
      const res = await supabase()
        .from("exchange_rates")
        .upsert({ user_id: userId, code, rate_to_base: rate });
      if (res.error) throw new Error(res.error.message);
      setRates((prev) => {
        const next = prev.filter((r) => r.code !== code);
        return [...next, { code, rate_to_base: rate }];
      });
      await refresh();
    },
    [refresh, supabase, userId],
  );

  const syncRates: Store["syncRates"] = useCallback(async () => {
    const base = profile?.base_currency ?? "KZT";
    const res = await fetch("/api/rates");
    const json = (await res.json()) as { kzt?: Record<string, number>; date?: string; source?: "nbk" | "open"; error?: string };
    if (!res.ok || !json.kzt) throw new Error(json.error ?? "Курс сейчас недоступен");
    // Таблица — «сколько тенге за единицу». Основная валюта может быть и не
    // тенге: тогда считаем через тенге, кросс-курсом.
    const kzt = (code: string) => (code === "KZT" ? 1 : json.kzt![code]);
    const rows = CURRENCIES.filter((c) => c.code !== base && kzt(c.code) && kzt(base)).map((c) => ({
      user_id: userId,
      code: c.code,
      rate_to_base: Math.round((kzt(c.code) / kzt(base)) * 1e6) / 1e6,
      updated_at: new Date().toISOString(),
    }));
    if (!userId || rows.length === 0) throw new Error("Курс сейчас недоступен");
    const up = await supabase().from("exchange_rates").upsert(rows);
    if (up.error) throw new Error(up.error.message);
    setRates((prev) => [
      ...prev.filter((r) => !rows.some((row) => row.code === r.code)),
      ...rows.map(({ code, rate_to_base, updated_at }) => ({ code, rate_to_base, updated_at })),
    ]);
    const info = { date: json.date ?? "", source: json.source ?? "nbk", base };
    try {
      localStorage.setItem(RATES_KEY, JSON.stringify(info));
    } catch {
      // Нет хранилища — в следующий раз просто обновим ещё раз.
    }
    return info;
  }, [profile?.base_currency, supabase, userId]);

  // Сам курс — раз в полдня при открытии, и сразу после смены основной
  // валюты: старые курсы были посчитаны к прежней.
  useEffect(() => {
    if (!ready || !profile?.rates_auto || !userId) return;
    const base = profile.base_currency;
    let synced: { base?: string } = {};
    try {
      synced = JSON.parse(localStorage.getItem(RATES_KEY) ?? "{}");
    } catch {
      // Испорченная запись — считаем, что не обновляли.
    }
    const others = CURRENCIES.filter((c) => c.code !== base);
    const oldest = Math.min(
      ...others.map((c) => {
        const at = rates.find((r) => r.code === c.code)?.updated_at;
        return at ? new Date(at).getTime() : 0;
      }),
    );
    const stale = Date.now() - oldest > 12 * 3600_000 || synced.base !== base;
    if (stale) void syncRates().catch(() => undefined);
    // rates намеренно не в зависимостях: после записи они меняются, а
    // повторять запрос из-за собственной записи незачем.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, profile?.rates_auto, profile?.base_currency, userId, syncRates]);

  const moneyHidden = useMoneyHidden();

  const pendingCount = pending.length;

  const value = useMemo<Store>(
    () => ({
      ready,
      moneyHidden,
      error,
      userId,
      profile,
      rates,
      wallets,
      categories,
      balances,
      pools: effectivePools,
      transactions: visibleTransactions,
      pendingCount,
      balanceOf,
      poolOf,
      toBase,
      refresh,
      addIncome,
      allocate,
      addExpense,
      addTransfer,
      setWalletBalance,
      addToDebt,
      accrueInterest,
      updateTransaction,
      deleteTransaction,
      saveWallet,
      deleteWallet,
      resetMoneyData,
      saveCategory,
      reorderCategories,
      addSubcategory,
      importDrafts,
      deleteCategory,
      saveProfile,
      saveRate,
      syncRates,
    }),
    [
      ready, moneyHidden, error, userId, profile, rates, wallets, categories, balances, effectivePools,
      visibleTransactions, pendingCount, balanceOf, poolOf, toBase, refresh, addIncome, allocate,
      addExpense, addTransfer, setWalletBalance, addToDebt, accrueInterest, updateTransaction, deleteTransaction,
      saveWallet, deleteWallet, resetMoneyData, saveCategory, reorderCategories, addSubcategory, importDrafts, deleteCategory, saveProfile, saveRate, syncRates,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
