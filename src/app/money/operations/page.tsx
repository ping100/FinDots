"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/lib/icons";
import { formatMoney, monthLabel, monthRange, parseAmount } from "@/lib/money";
import type { Category, Transaction, TxType, Wallet } from "@/lib/types";
import { useStore } from "@/components/DataProvider";
import { Button, Field, Sheet, inputClass, inputStyle } from "@/components/ui";

const TYPE_LABEL: Record<TxType, string> = {
  income: "Доход",
  allocation: "В кошелёк",
  expense: "Трата",
  transfer: "Перенос",
  adjustment: "Корректировка",
};

const FILTERS: { id: "all" | TxType; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "expense", label: "Траты" },
  { id: "income", label: "Доходы" },
  { id: "allocation", label: "Разнос" },
  { id: "transfer", label: "Переносы" },
];

export default function OperationsPage() {
  const { transactions, categories, wallets, toBase, profile, updateTransaction, deleteTransaction } =
    useStore();
  const [filter, setFilter] = useState<"all" | TxType>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const base = profile?.base_currency ?? "KZT";
  const nameOfCategory = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "—";
  /** «Продукты → магазин»: уточнение дописываем к названию категории. */
  const withSub = (t: Transaction) => {
    const sub = categories.find((c) => c.id === t.subcategory_id)?.name;
    return sub ? `${nameOfCategory(t.category_id)} → ${sub}` : nameOfCategory(t.category_id);
  };
  const nameOfWallet = (id: string | null) => wallets.find((w) => w.id === id)?.name ?? "—";

  const describe = (t: Transaction) => {
    switch (t.type) {
      case "income":
        return withSub(t);
      case "allocation":
        return `${nameOfCategory(
          transactions.find((p) => p.id === t.parent_id)?.category_id ?? null,
        )} → ${nameOfWallet(t.wallet_id)}`;
      case "expense":
        return `${withSub(t)} · ${nameOfWallet(t.wallet_id)}`;
      case "transfer":
        return `${nameOfWallet(t.from_wallet_id)} → ${nameOfWallet(t.to_wallet_id)}`;
      case "adjustment":
        return nameOfWallet(t.wallet_id);
    }
  };

  const { groups, saldo } = useMemo(() => {
    const { from, to } = monthRange(offset);
    const needle = query.trim().toLowerCase();

    const visible = transactions.filter((t) => {
      const at = new Date(t.occurred_at);
      if (at < from || at >= to) return false;
      if (filter !== "all" && t.type !== filter) return false;
      if (needle && !(t.note ?? "").toLowerCase().includes(needle)) return false;
      return true;
    });

    // Сальдо месяца — доходы минус траты, переносы внутри своих кошельков не в счёт.
    let balance = 0;
    for (const t of visible) {
      const value = toBase(Number(t.amount), t.currency);
      if (t.type === "income") balance += value;
      if (t.type === "expense") balance -= value;
    }

    const byDay = new Map<string, Transaction[]>();
    for (const t of visible) {
      const day = t.occurred_at.slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), t]);
    }
    return {
      groups: [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])),
      saldo: balance,
    };
  }, [transactions, filter, query, offset, toBase]);

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <header className="relative flex items-center justify-center py-2">
        <h1 className="text-[1.0625rem] font-semibold">История</h1>
        <button
          onClick={() => setFiltersOpen(true)}
          aria-label="Фильтр"
          className="absolute right-0 flex h-10 w-10 items-center justify-center rounded-full"
          style={{
            background: "var(--surface)",
            border: `1px solid ${filter === "all" ? "var(--border)" : "var(--accent)"}`,
            color: filter === "all" ? "var(--muted)" : "var(--accent)",
          }}
        >
          <Icon name="filter" size={18} />
        </button>
      </header>

      <label className="mb-3 flex items-center gap-2 rounded-2xl px-3.5 py-2.5" style={{ background: "var(--surface-2)" }}>
        <Icon name="search" size={17} style={{ color: "var(--muted)" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по примечаниям"
          className="w-full bg-transparent outline-none"
        />
      </label>

      <div className="mb-1 flex items-center justify-between">
        <button onClick={() => setOffset((o) => o - 1)} aria-label="Раньше" style={{ color: "var(--accent)" }}>
          <Icon name="chevron-left" size={22} />
        </button>
        <span className="text-[0.9375rem] font-semibold first-letter:uppercase">{monthLabel(offset, true)}</span>
        <button
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          disabled={offset >= 0}
          aria-label="Позже"
          className="disabled:opacity-25"
          style={{ color: "var(--accent)" }}
        >
          <Icon name="chevron-right" size={22} />
        </button>
      </div>

      <p className="text-center text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        сальдо
      </p>
      <p
        className="mb-4 text-center text-3xl font-bold tabular-nums"
        style={{ color: saldo < 0 ? "var(--danger)" : "var(--text)" }}
      >
        {formatMoney(saldo, base)}
      </p>

      {groups.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-[0.9375rem] font-semibold">За этот период данных нет</p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            добавлять операции можно в разделе «Панель»
          </p>
        </div>
      ) : null}

      {groups.map(([day, items]) => (
        <section key={day} className="mb-4">
          <h2 className="mb-1.5 px-1 text-xs" style={{ color: "var(--muted)" }}>
            {new Date(day).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
              weekday: "short",
            })}
          </h2>
          <div className="overflow-hidden rounded-2xl" style={{ background: "var(--surface)" }}>
            {items.map((t, index) => (
              <button
                key={t.id}
                onClick={() => setEditing(t)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
                style={{ borderTop: index ? "1px solid var(--border)" : undefined }}
              >
                <span className="flex-1">
                  <span className="block text-sm">{describe(t)}</span>
                  <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                    {TYPE_LABEL[t.type]}
                    {t.note ? ` · ${t.note}` : ""}
                  </span>
                </span>
                <span
                  className="whitespace-nowrap text-sm font-semibold tabular-nums"
                  style={{
                    color:
                      t.type === "income"
                        ? "var(--ok)"
                        : t.type === "expense"
                          ? "var(--danger)"
                          : "var(--text)",
                  }}
                >
                  {t.type === "expense" ? "−" : t.type === "income" ? "+" : ""}
                  {formatMoney(Math.abs(Number(t.amount)), t.currency)}
                </span>
                <Icon name="chevron-right" size={15} className="opacity-30" />
              </button>
            ))}
          </div>
        </section>
      ))}

      <Link
        href="/money"
        aria-label="Добавить операцию"
        className="fixed bottom-24 right-5 flex h-14 w-14 items-center justify-center rounded-full text-white"
        style={{ background: "var(--accent)", boxShadow: "0 6px 20px rgba(0,0,0,0.22)" }}
      >
        <Icon name="plus" size={26} />
      </Link>

      <Sheet open={filtersOpen} title="Показывать" onClose={() => setFiltersOpen(false)}>
        <div className="grid grid-cols-2 gap-2 pb-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setFilter(f.id);
                setFiltersOpen(false);
              }}
              className="rounded-2xl px-3 py-2.5 text-sm"
              style={{
                background: filter === f.id ? "var(--accent)" : "var(--surface-2)",
                color: filter === f.id ? "#fff" : "inherit",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Sheet>

      <EditSheet
        transaction={editing}
        categories={categories}
        wallets={wallets}
        onClose={() => setEditing(null)}
        onSave={updateTransaction}
        onDelete={deleteTransaction}
      />
    </div>
  );
}

function EditSheet({
  transaction,
  categories,
  wallets,
  onClose,
  onSave,
  onDelete,
}: {
  transaction: Transaction | null;
  categories: Category[];
  wallets: Wallet[];
  onClose: () => void;
  onSave: (id: string, patch: Partial<Transaction>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  if (transaction && loadedId !== transaction.id) {
    setLoadedId(transaction.id);
    setAmount(String(transaction.amount));
    setNote(transaction.note ?? "");
    setDate(transaction.occurred_at.slice(0, 10));
    setCategoryId(transaction.category_id);
    setSubcategoryId(transaction.subcategory_id);
    setWalletId(transaction.wallet_id);
  }

  if (!transaction) return null;

  // Убранные с экрана не предлагаем, но ту, что уже стоит в операции,
  // показываем — иначе при сохранении она молча заменится на другую.
  const usable = (c: Category) => !c.archived || c.id === transaction.category_id;
  const moveable = transaction.type === "income" || transaction.type === "expense";
  const tops = categories.filter((c) => c.kind === transaction.type && !c.parent_id && usable(c));
  const subs = categories.filter((c) => !c.archived && c.parent_id === categoryId);
  const money = wallets.filter(
    (w) => !w.archived && (w.kind === "cash" || w.kind === "card" || w.id === transaction.wallet_id),
  );

  const save = async () => {
    const value = parseAmount(amount);
    if (value == null || busy) return;
    setBusy(true);
    try {
      await onSave(transaction.id, {
        amount: value,
        note: note || null,
        occurred_at: new Date(date + "T12:00:00").toISOString(),
        ...(moveable
          ? {
              category_id: categoryId,
              subcategory_id: subcategoryId,
              ...(transaction.type === "expense" ? { wallet_id: walletId } : {}),
            }
          : {}),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      title={TYPE_LABEL[transaction.type]}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <Button onClick={save} disabled={busy}>
            Сохранить
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              setBusy(true);
              try {
                await onDelete(transaction.id);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            Удалить
          </Button>
        </div>
      }
    >
      <Field label={`Сумма, ${transaction.currency}`}>
        <input
          className={inputClass}
          style={inputStyle}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      {moveable ? (
        <>
          <Field label={transaction.type === "income" ? "Источник" : "Категория"}>
            <select
              className={inputClass}
              style={inputStyle}
              value={categoryId ?? ""}
              onChange={(e) => {
                setCategoryId(e.target.value || null);
                // Уточнение принадлежит прежней категории — при переносе
                // оно теряет смысл, поэтому сбрасываем.
                setSubcategoryId(null);
              }}
            >
              {tops.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.archived ? " (убрана с экрана)" : ""}
                </option>
              ))}
            </select>
          </Field>

          {subs.length ? (
            <Field label="Уточнение">
              <select
                className={inputClass}
                style={inputStyle}
                value={subcategoryId ?? ""}
                onChange={(e) => setSubcategoryId(e.target.value || null)}
              >
                <option value="">без уточнения</option>
                {subs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {transaction.type === "expense" ? (
            <Field label="Откуда списано">
              <select
                className={inputClass}
                style={inputStyle}
                value={walletId ?? ""}
                onChange={(e) => setWalletId(e.target.value || null)}
              >
                {money.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </>
      ) : null}

      <Field label="Комментарий">
        <input
          className={inputClass}
          style={inputStyle}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Field label="Дата">
        <input
          type="date"
          className={inputClass}
          style={inputStyle}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      {transaction.type === "income" ? (
        <p className="pb-2 text-xs" style={{ color: "var(--muted)" }}>
          Если уменьшить доход ниже уже разнесённой суммы, остаток по категории
          станет отрицательным — сначала поправь или удали переносы в кошельки.
        </p>
      ) : null}
    </Sheet>
  );
}
