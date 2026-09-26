"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import type { Wallet, WalletKind } from "@/lib/types";
import { useStore } from "@/components/DataProvider";
import { AmountSheet } from "@/components/AmountSheet";
import { toISODate } from "@/lib/savings";
import { WalletEditor } from "@/components/WalletEditor";
import { Button } from "@/components/ui";

/** Сколько дней осталось до даты; отрицательное — просрочено. */
function daysLeft(date: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(date).getTime() - today.getTime()) / 86_400_000);
}

/** Ближайшее число месяца: сегодня, если ещё не прошло, иначе — в следующем. */
function nextRecurringDate(day: number, today = new Date()): Date {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const thisMonth = new Date(base.getFullYear(), base.getMonth(), day);
  return thisMonth >= base ? thisMonth : new Date(base.getFullYear(), base.getMonth() + 1, day);
}

export default function DebtsPage() {
  const { wallets, balanceOf, addTransfer } = useStore();
  const [paying, setPaying] = useState<Wallet | null>(null);
  // Возврат долга мне: деньги идут из долга в выбранный кошелёк.
  const [returning, setReturning] = useState<Wallet | null>(null);
  // Дал в долг: деньги идут из выбранного кошелька в долг — иначе баланс
  // «Мне должны» так и остаётся нулевым и вернуть потом нечего.
  const [lending, setLending] = useState<Wallet | null>(null);
  const [editor, setEditor] =
    useState<{ wallet?: Wallet | null; kind: WalletKind; credit?: boolean } | null>(null);

  const live = wallets.filter((w) => !w.archived);
  // Кредит отличается от долга тем, что гасится частями по графику, а не
  // отдаётся целиком, — поэтому у него свой раздел и свой платёж.
  const credits = live.filter((w) => w.kind === "debt_out" && !!w.monthly_payment);
  const owed = live.filter((w) => w.kind === "debt_out" && !w.monthly_payment);
  const due = live.filter((w) => w.kind === "debt_in");
  const moneyWallets = live.filter((w) => w.kind === "cash" || w.kind === "card");

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-28 pt-3">
      <h1 className="mb-1 text-xl font-semibold">Долги и обязательные платежи</h1>
      <p className="mb-4 text-xs leading-snug" style={{ color: "var(--muted)" }}>
        Кредит гасится частями по графику, долг — целиком. И то и другое
        закрывается переносом денег из кошелька: здесь или перетаскиванием на
        главном экране. Пока не отдано, откладывается из «можно тратить
        сегодня». Аренда и подписки — не долги: они живут блоком «Каждый
        месяц» под расходами.
      </p>

      <Group title="Кредиты и рассрочки" empty="Кредитов нет">
        {credits.map((w) => (
          <DebtCard
            key={w.id}
            wallet={w}
            amount={balanceOf(w.id)}
            onPay={() => setPaying(w)}
            onEdit={() => setEditor({ wallet: w, kind: "debt_out", credit: true })}
          />
        ))}
      </Group>

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
            payDisabled={balanceOf(w.id) <= 0}
            secondaryLabel="Дал в долг"
            onSecondary={() => setLending(w)}
            onEdit={() => setEditor({ wallet: w, kind: "debt_in" })}
          />
        ))}
      </Group>

      <div className="space-y-2">
        <Button
          variant="ghost"
          onClick={() => setEditor({ wallet: null, kind: "debt_out", credit: true })}
        >
          Добавить кредит или рассрочку
        </Button>
        <Button variant="ghost" onClick={() => setEditor({ wallet: null, kind: "debt_out" })}>
          Добавить долг
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

      <AmountSheet
        open={!!lending}
        title={lending ? `Дал в долг: ${lending.name}` : ""}
        subtitle="Деньги спишутся с выбранного кошелька"
        currency={lending?.currency ?? "KZT"}
        options={moneyWallets.map((w) => ({
          id: w.id,
          name: w.name,
          caption: formatMoney(balanceOf(w.id), w.currency),
        }))}
        optionLabel="Из какого кошелька"
        submitLabel="Записать"
        onClose={() => setLending(null)}
        onSubmit={async ({ amount, note, occurredAt, optionId }) => {
          if (!lending || !optionId) throw new Error("Выбери кошелёк");
          const from = wallets.find((w) => w.id === optionId);
          if (!from) throw new Error("Кошелёк не найден");
          await addTransfer({
            fromWalletId: from.id,
            toWalletId: lending.id,
            amount,
            currency: from.currency,
            note: note || "Дал в долг",
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
        credit={editor?.credit}
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
  payDisabled,
  onSecondary,
  secondaryLabel,
  onEdit,
}: {
  wallet: Wallet;
  amount: number;
  onPay?: () => void;
  actionLabel?: string;
  payDisabled?: boolean;
  onSecondary?: () => void;
  secondaryLabel?: string;
  onEdit: () => void;
}) {
  // У кредита обычно платёж каждый месяц, а «Дата погашения» — это конец
  // всего срока, часто через годы. Напоминать и подсвечивать красным нужно
  // перед ближайшим ежемесячным платежом, а не перед этой далёкой датой.
  const recurring = wallet.is_recurring && wallet.recurring_day != null;
  const nextDue = recurring
    ? toISODate(nextRecurringDate(wallet.recurring_day!))
    : wallet.due_date;
  const left = nextDue ? daysLeft(nextDue) : null;
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
          {nextDue ? (
            <span
              className="block text-[0.6875rem]"
              style={{ color: remind ? "var(--danger)" : "var(--muted)" }}
            >
              {recurring
                ? left === 0
                  ? "платёж сегодня"
                  : `платёж через ${left} дн. · ${new Date(nextDue).toLocaleDateString("ru-RU")}`
                : left != null && left < 0
                  ? `просрочено на ${-left} дн.`
                  : `осталось ${left} дн. · до ${new Date(nextDue).toLocaleDateString("ru-RU")}`}
            </span>
          ) : null}
        </button>
        <span className="text-right">
          <span className="block text-base font-semibold tabular-nums">
            {formatMoney(amount, wallet.currency)}
          </span>
          {wallet.monthly_payment ? (
            <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              {formatMoney(wallet.monthly_payment, wallet.currency)}
              {wallet.recurring_day ? ` · ${wallet.recurring_day}-го` : " в месяц"}
            </span>
          ) : null}
        </span>
      </div>
      {onPay ? (
        <div className="mt-3 flex gap-2">
          {onSecondary ? (
            <button
              onClick={onSecondary}
              className="flex-1 rounded-xl py-2 text-sm font-semibold"
              style={{ background: "var(--surface-2)" }}
            >
              {secondaryLabel}
            </button>
          ) : null}
          <button
            onClick={onPay}
            disabled={payDisabled}
            className="flex-1 rounded-xl py-2 text-sm font-semibold disabled:opacity-40"
            style={{ background: "var(--surface-2)" }}
          >
            {actionLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
