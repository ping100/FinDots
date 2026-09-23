"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import type { Wallet, WalletKind } from "@/lib/types";
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
  // Возврат долга мне: деньги идут из долга в выбранный кошелёк.
  const [returning, setReturning] = useState<Wallet | null>(null);
  const [editor, setEditor] =
    useState<{ wallet?: Wallet | null; kind: WalletKind } | null>(null);

  const live = wallets.filter((w) => !w.archived);
  const owed = live.filter((w) => w.kind === "debt_out");
  const due = live.filter((w) => w.kind === "debt_in");
  const moneyWallets = live.filter((w) => w.kind === "cash" || w.kind === "card");

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-28 pt-3">
      <h1 className="mb-1 text-xl font-semibold">Долги и обязательные платежи</h1>
      <p className="mb-4 text-xs leading-snug" style={{ color: "var(--muted)" }}>
        Долг — это то, что нужно отдать целиком: он гасится переносом денег из
        кошелька, здесь или перетаскиванием на главном экране. Пока не отдан,
        он откладывается из «можно тратить сегодня». Аренда и подписки — не
        долги: они живут блоком «Каждый месяц» под расходами.
      </p>

      <Group title="Я должен" empty="Долгов нет">
        {owed.map((w) => (
          <DebtCard
            key={w.id}
            wallet={w}
            amount={balanceOf(w.id)}
            onPay={() => setPaying(w)}
            onEdit={() => setEditor({ wallet: w, kind: "debt_out" })}
          />
        ))}
      </Group>

      <Group title="Мне должны" empty="Никто не должен">
        {due.map((w) => (
          <DebtCard
            key={w.id}
            wallet={w}
            amount={balanceOf(w.id)}
            actionLabel="Мне вернули"
            onPay={() => setReturning(w)}
            onEdit={() => setEditor({ wallet: w, kind: "debt_in" })}
          />
        ))}
      </Group>

      <div className="space-y-2">
        <Button variant="ghost" onClick={() => setEditor({ wallet: null, kind: "debt_out" })}>
          Добавить долг или кредит
        </Button>
        <Button variant="ghost" onClick={() => setEditor({ wallet: null, kind: "debt_in" })}>
          Записать, что мне должны
        </Button>
      </div>

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

      <AmountSheet
        open={!!returning}
        title={returning ? `Вернул: ${returning.name}` : ""}
        subtitle="Деньги придут в выбранный кошелёк"
        currency={returning?.currency ?? "KZT"}
        max={returning ? Math.max(balanceOf(returning.id), 0) : undefined}
        options={moneyWallets.map((w) => ({
          id: w.id,
          name: w.name,
          caption: formatMoney(balanceOf(w.id), w.currency),
        }))}
        optionLabel="Куда зачислить"
        submitLabel="Записать возврат"
        onClose={() => setReturning(null)}
        onSubmit={async ({ amount, note, occurredAt, optionId }) => {
          if (!returning || !optionId) throw new Error("Выбери кошелёк");
          await addTransfer({
            fromWalletId: returning.id,
            toWalletId: optionId,
            amount,
            currency: returning.currency,
            note: note || "Возврат долга",
            occurredAt,
          });
        }}
      />

      {/* Тип задан кнопкой, которой сюда пришли: выбирать «наличные» на
          странице долгов незачем. */}
      <WalletEditor
        open={!!editor}
        wallet={editor?.wallet}
        defaultKind={editor?.kind ?? "debt_out"}
        kinds={editor ? [editor.kind] : undefined}
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
  actionLabel = "Внести платёж",
  onEdit,
}: {
  wallet: Wallet;
  amount: number;
  onPay?: () => void;
  actionLabel?: string;
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
              className="block text-[0.6875rem]"
              style={{ color: remind ? "var(--danger)" : "var(--muted)" }}
            >
              {left != null && left < 0
                ? `просрочено на ${-left} дн.`
                : `осталось ${left} дн. · до ${new Date(wallet.due_date).toLocaleDateString("ru-RU")}`}
            </span>
          ) : null}
        </button>
        <span className="text-right">
          <span className="block text-base font-semibold tabular-nums">
            {formatMoney(amount, wallet.currency)}
          </span>
          {wallet.monthly_payment ? (
            <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
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
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
