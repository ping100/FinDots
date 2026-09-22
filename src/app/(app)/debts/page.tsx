"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import type { Wallet } from "@/lib/types";
import { useStore } from "@/components/DataProvider";
import { AmountSheet } from "@/components/AmountSheet";
import { WalletEditor } from "@/components/WalletEditor";
import { Button } from "@/components/ui";

/** Сколько дней осталось до даты; отрицательное — просрочено. */
function daysLeft(date: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(date).getTime() - today.getTime()) / 86_400_000);
}

export default function DebtsPage() {
  const { wallets, balanceOf, addTransfer } = useStore();
  const [paying, setPaying] = useState<Wallet | null>(null);
  const [editor, setEditor] = useState<{ wallet?: Wallet | null } | null>(null);

  const owed = wallets.filter((w) => w.kind === "debt_out");
  const due = wallets.filter((w) => w.kind === "debt_in");
  const recurring = wallets.filter((w) => w.is_recurring);
  const moneyWallets = wallets.filter((w) => w.kind === "cash" || w.kind === "card");

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-28 pt-3">
      <h1 className="mb-1 text-xl font-bold">Долги и обязательные платежи</h1>
      <p className="mb-4 text-xs" style={{ color: "var(--muted)" }}>
        Долг гасится переносом денег из кошелька — здесь или перетаскиванием на
        главном экране.
      </p>

      <Group title="Я должен" empty="Долгов нет">
        {owed.map((w) => (
          <DebtCard
            key={w.id}
            wallet={w}
            amount={balanceOf(w.id)}
            onPay={() => setPaying(w)}
            onEdit={() => setEditor({ wallet: w })}
          />
        ))}
      </Group>

      <Group title="Мне должны" empty="Никто не должен">
        {due.map((w) => (
          <DebtCard
            key={w.id}
            wallet={w}
            amount={balanceOf(w.id)}
            onEdit={() => setEditor({ wallet: w })}
          />
        ))}
      </Group>

      <Group title="Ежемесячные" empty="Регулярных платежей нет">
        {recurring.map((w) => (
          <div
            key={w.id}
            className="mb-2 flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: w.color + "26", color: w.color }}
            >
              <Icon name={w.icon} size={18} />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">{w.name}</span>
              <span className="block text-[11px]" style={{ color: "var(--muted)" }}>
                {w.recurring_day ? `${w.recurring_day}-го числа` : "каждый месяц"}
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {w.monthly_payment ? formatMoney(w.monthly_payment, w.currency) : "—"}
            </span>
          </div>
        ))}
      </Group>

      <Button variant="ghost" onClick={() => setEditor({ wallet: null })}>
        Добавить долг или кредит
      </Button>

      <AmountSheet
        open={!!paying}
        title={paying ? `Погасить: ${paying.name}` : ""}
        subtitle="Деньги спишутся с выбранного кошелька"
        currency={paying?.currency ?? "KZT"}
        initial={paying?.monthly_payment ?? undefined}
        max={paying ? Math.max(balanceOf(paying.id), 0) : undefined}
        options={moneyWallets.map((w) => ({
          id: w.id,
          name: w.name,
          caption: formatMoney(balanceOf(w.id), w.currency),
        }))}
        optionLabel="Откуда списать"
        submitLabel="Погасить"
        onClose={() => setPaying(null)}
        onSubmit={async ({ amount, note, occurredAt, optionId }) => {
          if (!paying || !optionId) throw new Error("Выбери кошелёк");
          const from = wallets.find((w) => w.id === optionId);
          if (!from) throw new Error("Кошелёк не найден");
          await addTransfer({
            fromWalletId: from.id,
            toWalletId: paying.id,
            amount,
            currency: from.currency,
            note: note || "Погашение долга",
            occurredAt,
          });
        }}
      />

      <WalletEditor
        open={!!editor}
        wallet={editor?.wallet}
        defaultKind="debt_out"
        onClose={() => setEditor(null)}
      />
    </div>
  );
}

function Group({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const isEmpty = !Array.isArray(children) || children.length === 0;
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {isEmpty ? (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {empty}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function DebtCard({
  wallet,
  amount,
  onPay,
  onEdit,
}: {
  wallet: Wallet;
  amount: number;
  onPay?: () => void;
  onEdit: () => void;
}) {
  const left = wallet.due_date ? daysLeft(wallet.due_date) : null;
  const remind =
    left != null && wallet.reminder_days != null && left <= wallet.reminder_days;

  return (
    <div
      className="mb-2 rounded-2xl p-4"
      style={{
        background: "var(--surface)",
        border: `1px solid ${remind ? "var(--danger)" : "var(--border)"}`,
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: wallet.color + "26", color: wallet.color }}
        >
          <Icon name={wallet.icon} size={18} />
        </span>
        <button className="flex-1 text-left" onClick={onEdit}>
          <span className="block text-sm font-medium">{wallet.name}</span>
          {wallet.due_date ? (
            <span
              className="block text-[11px]"
              style={{ color: remind ? "var(--danger)" : "var(--muted)" }}
            >
              {left != null && left < 0
                ? `просрочено на ${-left} дн.`
                : `осталось ${left} дн. · до ${new Date(wallet.due_date).toLocaleDateString("ru-RU")}`}
            </span>
          ) : null}
        </button>
        <span className="text-right">
          <span className="block text-base font-bold tabular-nums">
            {formatMoney(amount, wallet.currency)}
          </span>
          {wallet.monthly_payment ? (
            <span className="block text-[11px]" style={{ color: "var(--muted)" }}>
              платёж {formatMoney(wallet.monthly_payment, wallet.currency)}
            </span>
          ) : null}
        </span>
      </div>
      {onPay ? (
        <button
          onClick={onPay}
          className="mt-3 w-full rounded-xl py-2 text-sm font-semibold"
          style={{ background: "var(--surface-2)" }}
        >
          Внести платёж
        </button>
      ) : null}
    </div>
  );
}
