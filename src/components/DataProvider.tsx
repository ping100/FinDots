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
import { createClient } from "@/lib/supabase/client";
import { PALETTE } from "@/lib/icons";
import { convert } from "@/lib/money";
import type { Draft } from "@/lib/importCsv";
import { maturedAccruals, toISODate } from "@/lib/savings";
import { scaleFactor } from "@/lib/textScale";
import { rememberLook } from "@/lib/look";
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

export interface Store {
  ready: boolean;
  error: string | null;
  userId: string | null;
  profile: Profile | null;
  rates: ExchangeRate[];
  wallets: Wallet[];
  categories: Category[];
  balances: WalletBalance[];
  pools: IncomePool[];
  transactions: Transaction[];
  /** Последние 4 символа ключа OpenRouter; null — ключ не задан. */
  aiKeyHint: string | null;

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
  }) => Promise<void>;
  addTransfer: (args: {
    fromWalletId: string;
    toWalletId: string;
    amount: number;
    currency: CurrencyCode;
    note?: string;
    occurredAt?: string;
  }) => Promise<void>;
  setWalletBalance: (walletId: string, target: number) => Promise<void>;
  /** Записать созревшие проценты по вкладу. Возвращает начисленную сумму. */
  accrueInterest: (walletId: string) => Promise<number>;

  updateTransaction: (id: string, patch: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  saveWallet: (wallet: Partial<Wallet> & { id?: string }) => Promise<void>;
  deleteWallet: (id: string) => Promise<void>;
  saveCategory: (category: Partial<Category> & { id?: string }) => Promise<void>;
  /** Завести подкатегорию внутри категории; возвращает её id. */
  addSubcategory: (parentId: string, name: string) => Promise<string>;
  /** Загрузить операции из чужой выгрузки; сообщает о ходе работы. */
  importDrafts: (
    drafts: Draft[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<{ added: number; categories: number; wallets: number }>;
  deleteCategory: (id: string) => Promise<void>;

  saveProfile: (patch: Partial<Profile>) => Promise<void>;
  saveRate: (code: CurrencyCode, rate: number) => Promise<void>;
  saveAiKey: (key: string) => Promise<void>;
  deleteAiKey: () => Promise<void>;
}

/** Куда падают проценты по вкладам. Заводится сама при первом начислении. */
const INTEREST_CATEGORY = "Проценты";

/**
 * Ошибки, которые проходят сами со второй попытки.
 *
 * «JWT issued at future» — рассинхрон внутри Supabase: токен выдаёт один
 * сервис, а проверяет база, и на секунду их часы расходятся. Часы телефона
 * тут ни при чём, чинить нечего — надо просто повторить запрос.
 */
function transient(message: string): boolean {
  return /jwt|token is expired|failed to fetch|network|fetch failed/i.test(message);
}

/** Техническую строку от сервера человеку показывать незачем. */
function human(message: string): string {
  if (transient(message)) return "Связь с сервером сорвалась — пробую ещё раз";
  if (/row-level security|permission denied/i.test(message)) {
    return "Нет доступа к этим данным — попробуйте войти заново";
  }
  return message;
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
  const [aiKeyHint, setAiKeyHint] = useState<string | null>(null);

  const load = useCallback(async (retry = true) => {
    const {
      data: { user },
    } = await supabase().auth.getUser();
    if (!user) {
      setReady(true);
      return;
    }
    setUserId(user.id);

    const [p, r, w, c, b, ip, tx] = await Promise.all([
      supabase().from("profiles").select("*").eq("id", user.id).single(),
      supabase().from("exchange_rates").select("code, rate_to_base"),
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

    // Полный ключ в браузер не тянем — только хвост из представления.
    const key = await supabase().from("ai_key_status").select("hint").maybeSingle();
    setAiKeyHint((key.data?.hint as string | undefined) ?? null);

    const firstError = [p, r, w, c, b, ip, tx].find((res) => res.error)?.error;
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
    document.documentElement.classList.toggle("dark", profile.theme === "dark");
    document.documentElement.style.fontSize = fontSize;
    // Запоминаем на устройстве, чтобы в следующий раз экран ожидания
    // открылся сразу в нужной теме, не дожидаясь профиля.
    rememberLook(profile.theme, fontSize);
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
    setBalances((b.data ?? []) as WalletBalance[]);
    setPools((ip.data ?? []) as IncomePool[]);
    setTransactions((tx.data ?? []) as Transaction[]);
  }, [supabase]);

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

  const balanceOf = useCallback(
    (walletId: string) =>
      Number(balances.find((b) => b.wallet_id === walletId)?.balance ?? 0),
    [balances],
  );

  const poolOf = useCallback(
    (categoryId: string) => {
      const rows = pools.filter((p) => p.category_id === categoryId);
      const currency = rows[0]?.currency ?? profile?.base_currency ?? "KZT";
      const amount = rows.reduce(
        (sum, row) => sum + convert(Number(row.unallocated), row.currency, currency, rates),
        0,
      );
      return { amount, currency };
    },
    [pools, profile, rates],
  );

  const toBase = useCallback(
    (amount: number, currency: CurrencyCode) =>
      convert(amount, currency, profile?.base_currency ?? "KZT", rates),
    [profile, rates],
  );

  // ─────────────────────────── операции ───────────────────────────

  const addIncome: Store["addIncome"] = useCallback(
    async ({ categoryId, subcategoryId, amount, currency, note, occurredAt }) =>
      guard(() =>
        supabase().from("transactions").insert({
          user_id: userId,
          type: "income",
          amount,
          currency,
          category_id: categoryId,
          subcategory_id: subcategoryId || null,
          note: note || null,
          occurred_at: occurredAt ?? new Date().toISOString(),
        }),
      ),
    [guard, supabase, userId],
  );

  /**
   * Разнос дохода по кошелькам. Сумма списывается с самых ранних
   * нераспределённых поступлений этой категории (FIFO) и может лечь
   * на несколько строк дохода сразу — поэтому вставок может быть больше одной.
   */
  const allocate: Store["allocate"] = useCallback(
    async ({ categoryId, walletId, amount, currency }) => {
      const allocatedByParent = new Map<string, number>();
      for (const t of transactions) {
        if (t.type !== "allocation" || !t.parent_id) continue;
        allocatedByParent.set(
          t.parent_id,
          (allocatedByParent.get(t.parent_id) ?? 0) + Number(t.amount),
        );
      }

      const sources = transactions
        .filter((t) => t.type === "income" && t.category_id === categoryId)
        .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
        .map((t) => ({
          tx: t,
          left: Number(t.amount) - (allocatedByParent.get(t.id) ?? 0),
        }))
        .filter((s) => s.left > 0.004);

      let remaining = amount;
      const rows: Record<string, unknown>[] = [];
      for (const source of sources) {
        if (remaining <= 0.004) break;
        // остаток источника — в его валюте, переносимая сумма — в валюте переноса
        const leftInDragCurrency = convert(source.left, source.tx.currency, currency, rates);
        const take = Math.min(remaining, leftInDragCurrency);
        rows.push({
          user_id: userId,
          type: "allocation",
          amount: Math.round(take * 100) / 100,
          currency,
          wallet_id: walletId,
          parent_id: source.tx.id,
          occurred_at: new Date().toISOString(),
        });
        remaining -= take;
      }

      if (!rows.length) throw new Error("Нечего переносить: нераспределённого дохода нет");
      await guard(() => supabase().from("transactions").insert(rows));
    },
    [guard, rates, supabase, transactions, userId],
  );

  const addExpense: Store["addExpense"] = useCallback(
    async ({ categoryId, subcategoryId, walletId, amount, currency, note, occurredAt }) =>
      guard(() =>
        supabase().from("transactions").insert({
          user_id: userId,
          type: "expense",
          amount,
          currency,
          category_id: categoryId,
          subcategory_id: subcategoryId || null,
          wallet_id: walletId,
          note: note || null,
          occurred_at: occurredAt ?? new Date().toISOString(),
        }),
      ),
    [guard, supabase, userId],
  );

  const addTransfer: Store["addTransfer"] = useCallback(
    async ({ fromWalletId, toWalletId, amount, currency, note, occurredAt }) =>
      guard(() =>
        supabase().from("transactions").insert({
          user_id: userId,
          type: "transfer",
          amount,
          currency,
          from_wallet_id: fromWalletId,
          to_wallet_id: toWalletId,
          note: note || null,
          occurred_at: occurredAt ?? new Date().toISOString(),
        }),
      ),
    [guard, supabase, userId],
  );

  /** Ручная правка баланса записывается отдельной операцией, а не затиранием истории. */
  const setWalletBalance: Store["setWalletBalance"] = useCallback(
    async (walletId, target) => {
      const wallet = wallets.find((w) => w.id === walletId);
      if (!wallet) throw new Error("Кошелёк не найден");
      const delta = Math.round((target - balanceOf(walletId)) * 100) / 100;
      if (Math.abs(delta) < 0.005) return;
      await guard(() =>
        supabase().from("transactions").insert({
          user_id: userId,
          type: "adjustment",
          amount: delta,
          currency: wallet.currency,
          wallet_id: walletId,
          note: "Ручная корректировка",
          occurred_at: new Date().toISOString(),
        }),
      );
    },
    [balanceOf, guard, supabase, userId, wallets],
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
   * Проценты по вкладу — это доход, а не появление денег из воздуха, поэтому
   * пишем их как обычное поступление плюс разнос на сам вклад: тогда они
   * видны в отчётах и их можно поправить или удалить, как любую операцию.
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

      let category = categories.find((c) => c.kind === "income" && c.name === INTEREST_CATEGORY);
      if (!category) {
        const created = await supabase()
          .from("categories")
          .insert({
            user_id: userId,
            kind: "income",
            name: INTEREST_CATEGORY,
            icon: "percent",
            color: "#0d9488",
          })
          .select("*")
          .single();
        if (created.error) throw new Error(created.error.message);
        category = created.data as Category;
      }

      // Каждый месяц пишем отдельной парой строк, по очереди: так в истории
      // видно, за какой период сколько пришло, и разнос точно привязан к
      // своему поступлению — без угадывания порядка вставки.
      for (const period of due) {
        const at = period.to.toISOString();
        const income = await supabase()
          .from("transactions")
          .insert({
            user_id: userId,
            type: "income",
            amount: period.amount,
            currency: wallet.currency,
            category_id: category.id,
            note: wallet.name,
            occurred_at: at,
          })
          .select("id")
          .single();
        if (income.error) throw new Error(income.error.message);

        const moved = await supabase().from("transactions").insert({
          user_id: userId,
          type: "allocation",
          amount: period.amount,
          currency: wallet.currency,
          wallet_id: wallet.id,
          parent_id: (income.data as { id: string }).id,
          occurred_at: at,
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
    [categories, rates, refresh, reloadDictionaries, supabase, transactions, userId, wallets],
  );

  const updateTransaction: Store["updateTransaction"] = useCallback(
    async (id, patch) => guard(() => supabase().from("transactions").update(patch).eq("id", id)),
    [guard, supabase],
  );

  const deleteTransaction: Store["deleteTransaction"] = useCallback(
    async (id) => guard(() => supabase().from("transactions").delete().eq("id", id)),
    [guard, supabase],
  );

  // ───────────────────── справочники ─────────────────────

  const saveWallet: Store["saveWallet"] = useCallback(
    async (wallet) => {
      const { id, ...fields } = wallet;
      const res = id
        ? await supabase().from("wallets").update(fields).eq("id", id)
        : await supabase().from("wallets").insert({ ...fields, user_id: userId });
      if (res.error) {
        setError(res.error.message);
        throw new Error(res.error.message);
      }
      await Promise.all([reloadDictionaries(), refresh()]);
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

  const saveAiKey: Store["saveAiKey"] = useCallback(
    async (key) => {
      if (!userId) return;
      const trimmed = key.trim();
      const res = await supabase()
        .from("ai_keys")
        .upsert({ user_id: userId, api_key: trimmed, updated_at: new Date().toISOString() });
      if (res.error) throw new Error(res.error.message);
      setAiKeyHint(trimmed.slice(-4));
    },
    [supabase, userId],
  );

  const deleteAiKey: Store["deleteAiKey"] = useCallback(async () => {
    if (!userId) return;
    const res = await supabase().from("ai_keys").delete().eq("user_id", userId);
    if (res.error) throw new Error(res.error.message);
    setAiKeyHint(null);
  }, [supabase, userId]);

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

  const value = useMemo<Store>(
    () => ({
      ready,
      error,
      userId,
      profile,
      rates,
      wallets,
      categories,
      balances,
      pools,
      transactions,
      aiKeyHint,
      balanceOf,
      poolOf,
      toBase,
      refresh,
      addIncome,
      allocate,
      addExpense,
      addTransfer,
      setWalletBalance,
      accrueInterest,
      updateTransaction,
      deleteTransaction,
      saveWallet,
      deleteWallet,
      saveCategory,
      addSubcategory,
      importDrafts,
      deleteCategory,
      saveProfile,
      saveRate,
      saveAiKey,
      deleteAiKey,
    }),
    [
      ready, error, userId, profile, rates, wallets, categories, balances, pools,
      transactions, balanceOf, poolOf, toBase, refresh, addIncome, allocate,
      addExpense, addTransfer, setWalletBalance, accrueInterest, updateTransaction, deleteTransaction,
      saveWallet, deleteWallet, saveCategory, addSubcategory, importDrafts, deleteCategory, saveProfile, saveRate,
      aiKeyHint, saveAiKey, deleteAiKey,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
