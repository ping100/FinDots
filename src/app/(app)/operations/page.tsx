"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import { formatMoney, parseAmount } from "@/lib/money";
import type { Transaction, TxType } from "@/lib/types";
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
  const { transactions, categories, wallets, updateTransaction, deleteTransaction } = useStore();
  const [filter, setFilter] = useState<"all" | TxType>("all");
  const [editing, setEditing] = useState<Transaction | null>(null);

  const nameOfCategory = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "—";
  const nameOfWallet = (id: string | null) => wallets.find((w) => w.id === id)?.name ?? "—";

  const describe = (t: Transaction) => {
    switch (t.type) {
      case "income":
        return nameOfCategory(t.category_id);
      case "allocation":
        return `${nameOfCategory(
          transactions.find((p) => p.id === t.parent_id)?.category_id ?? null,
        )} → ${nameOfWallet(t.wallet_id)}`;
      case "expense":
        return `${nameOfCategory(t.category_id)} · ${nameOfWallet(t.wallet_id)}`;
      case "transfer":
        return `${nameOfWallet(t.from_wallet_id)} → ${nameOfWallet(t.to_wallet_id)}`;
      case "adjustment":
        return nameOfWallet(t.wallet_id);
    }
  };

  const groups = useMemo(() => {
    const visible = transactions.filter((t) => filter === "all" || t.type === filter);
    const byDay = new Map<string, Transaction[]>();
    for (const t of visible) {
      const day = t.occurred_at.slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), t]);
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [transactions, filter]);

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-28 pt-3">
      <h1 className="mb-3 text-xl font-bold">Операции</h1>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-sm"
            style={{
              background: filter === f.id ? "var(--accent)" : "var(--surface-2)",
              color: filter === f.id ? "#fff" : "inherit",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
          Пока пусто
        </p>
      ) : null}

      {groups.map(([day, items]) => (
        <section key={day} className="mb-4">
          <h2 className="mb-1.5 text-xs" style={{ color: "var(--muted)" }}>
            {new Date(day).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
              weekday: "short",
            })}
          </h2>
          <div
            className="overflow-hidden rounded-2xl"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            {items.map((t, index) => (
              <button
                key={t.id}
                onClick={() => setEditing(t)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
                style={{ borderTop: index ? "1px solid var(--border)" : undefined }}
              >
                <span className="flex-1">
                  <span className="block text-sm">{describe(t)}</span>
                  <span className="block text-[11px]" style={{ color: "var(--muted)" }}>
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
                <Icon name="plus" size={14} className="-rotate-45 opacity-30" />
              </button>
            ))}
          </div>
        </section>
      ))}

      <EditSheet
        transaction={editing}
        onClose={() => setEditing(null)}
        onSave={updateTransaction}
        onDelete={deleteTransaction}
      />
    </div>
  );
}

function EditSheet({
  transaction,
  onClose,
  onSave,
  onDelete,
}: {
  transaction: Transaction | null;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Transaction>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  if (transaction && loadedId !== transaction.id) {
    setLoadedId(transaction.id);
    setAmount(String(transaction.amount));
    setNote(transaction.note ?? "");
    setDate(transaction.occurred_at.slice(0, 10));
  }

  if (!transaction) return null;

  const save = async () => {
    const value = parseAmount(amount);
    if (value == null || busy) return;
    setBusy(true);
    try {
      await onSave(transaction.id, {
        amount: value,
        note: note || null,
        occurred_at: new Date(date + "T12:00:00").toISOString(),
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
