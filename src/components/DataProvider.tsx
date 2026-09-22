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
import { convert } from "@/lib/money";
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

  updateTransaction: (id: string, patch: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  saveWallet: (wallet: Partial<Wallet> & { id?: string }) => Promise<void>;
  deleteWallet: (id: string) => Promise<void>;
  saveCategory: (category: Partial<Category> & { id?: string }) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  saveProfile: (patch: Partial<Profile>) => Promise<void>;
  saveRate: (code: CurrencyCode, rate: number) => Promise<void>;
  saveAiKey: (key: string) => Promise<void>;
  deleteAiKey: () => Promise<void>;
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

  const load = useCallback(async () => {
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
      supabase().from("wallets").select("*").eq("archived", false).order("sort_order"),
      supabase().from("categories").select("*").eq("archived", false).order("sort_order"),
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
    if (firstError) setError(firstError.message);

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

  // Тема живёт в профиле, чтобы переезжала между устройствами.
  useEffect(() => {
    if (!profile) return;
    document.documentElement.classList.toggle("dark", profile.theme === "dark");
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
      const { error: err } = await run();
      if (err) {
        setError(err.message);
        throw new Error(err.message);
      }
      await refresh();
    },
    [refresh],
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
    async ({ categoryId, amount, currency, note, occurredAt }) =>
      guard(() =>
        supabase().from("transactions").insert({
          user_id: userId,
          type: "income",
          amount,
          currency,
          category_id: categoryId,
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
    async ({ categoryId, walletId, amount, currency, note, occurredAt }) =>
      guard(() =>
        supabase().from("transactions").insert({
          user_id: userId,
          type: "expense",
          amount,
          currency,
          category_id: categoryId,
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

  const updateTransaction: Store["updateTransaction"] = useCallback(
    async (id, patch) => guard(() => supabase().from("transactions").update(patch).eq("id", id)),
    [guard, supabase],
  );

  const deleteTransaction: Store["deleteTransaction"] = useCallback(
    async (id) => guard(() => supabase().from("transactions").delete().eq("id", id)),
    [guard, supabase],
  );

  // ───────────────────── справочники ─────────────────────

  const reloadDictionaries = useCallback(async () => {
    const [w, c] = await Promise.all([
      supabase().from("wallets").select("*").eq("archived", false).order("sort_order"),
      supabase().from("categories").select("*").eq("archived", false).order("sort_order"),
    ]);
    setWallets((w.data ?? []) as Wallet[]);
    setCategories((c.data ?? []) as Category[]);
  }, [supabase]);

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

  const deleteCategory: Store["deleteCategory"] = useCallback(
    async (id) => {
      const res = await supabase().from("categories").update({ archived: true }).eq("id", id);
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
      updateTransaction,
      deleteTransaction,
      saveWallet,
      deleteWallet,
      saveCategory,
      deleteCategory,
      saveProfile,
      saveRate,
      saveAiKey,
      deleteAiKey,
    }),
    [
      ready, error, userId, profile, rates, wallets, categories, balances, pools,
      transactions, balanceOf, poolOf, toBase, refresh, addIncome, allocate,
      addExpense, addTransfer, setWalletBalance, updateTransaction, deleteTransaction,
      saveWallet, deleteWallet, saveCategory, deleteCategory, saveProfile, saveRate,
      aiKeyHint, saveAiKey, deleteAiKey,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
