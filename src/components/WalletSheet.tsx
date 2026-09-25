"use client";

import { useEffect, useMemo, useState } from "react";
import { convert, formatMoney, parseAmount } from "@/lib/money";
import {
  accruedSoFar,
  accrualStart,
  daysBetween,
  maturedAccruals,
  parseDate,
  projectedAtTerm,
  startOfToday,
} from "@/lib/savings";
import type { Wallet } from "@/lib/types";
import { useStore } from "./DataProvider";
import { KIND_LABEL } from "./WalletEditor";
import { Button, Field, Sheet, inputClass, inputStyle } from "./ui";

const dateText = (value: Date | string) =>
  (typeof value === "string" ? new Date(value) : value).toLocaleDateString("ru-RU");

/** Период начисления пишем коротко — иначе строка переносится: «14.07 — 14.08». */
const spanText = (from: Date, to: Date) => {
  const short = (d: Date) => d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  const year = to.getFullYear() === new Date().getFullYear() ? "" : `.${to.getFullYear()}`;
  return `${short(from)} — ${short(to)}${year}`;
};

/** 16.5 → «16,5»: по-русски дробь через запятую. */
const rateText = (rate: number) => String(rate).replace(".", ",").replace(/,?0+$/, "");

export function WalletSheet({
  wallet,
  onClose,
  onEdit,
}: {
  wallet: Wallet | null;
  onClose: () => void;
  onEdit: (wallet: Wallet) => void;
}) {
  const { balanceOf, setWalletBalance, accrueInterest, transactions, rates } = useStore();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const balance = wallet ? balanceOf(wallet.id) : 0;

  useEffect(() => {
    if (wallet) setValue(String(Math.round(balance * 100) / 100));
  }, [wallet, balance]);

  const savings = useMemo(() => {
    if (!wallet || wallet.kind !== "savings") return null;
    const toWallet = (amount: number, currency: string) =>
      convert(amount, currency, wallet.currency, rates);
    const today = startOfToday();
    const term = parseDate(wallet.term_end);
    return {
      due: maturedAccruals(wallet, transactions, toWallet, today),
      running: accruedSoFar(wallet, transactions, toWallet, today),
      since: accrualStart(wallet),
      term,
      daysLeft: term ? daysBetween(today, term) : null,
      forecast: projectedAtTerm(wallet, balance, today),
      goal: wallet.goal != null ? Number(wallet.goal) : null,
    };
  }, [wallet, transactions, rates, balance]);

  if (!wallet) return null;

  const isDebt = wallet.kind === "debt_out" || wallet.kind === "debt_in";

  const apply = async () => {
    const target = parseAmount(value);
    if (target == null || busy) return;
    setBusy(true);
    try {
      await setWalletBalance(wallet.id, target);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const accrue = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await accrueInterest(wallet.id);
    } finally {
      setBusy(false);
    }
  };

  const rate = wallet.rate != null ? Number(wallet.rate) : null;
  const left = savings?.goal != null ? savings.goal - balance : null;

  return (
    <Sheet
      open
      title={wallet.name}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <Button onClick={apply} disabled={busy}>
            Сохранить баланс
          </Button>
          <Button variant="ghost" onClick={() => onEdit(wallet)}>
            Настройки кошелька
          </Button>
        </div>
      }
    >
      <div className="mb-4 rounded-2xl p-4" style={{ background: "var(--surface-2)" }}>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {wallet.kind === "savings"
            ? rate
              ? `Вклад · ${rateText(rate)}% годовых`
              : "Копилка"
            : KIND_LABEL[wallet.kind]}
          {isDebt ? " · остаток долга" : ""}
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums">
          {formatMoney(balance, wallet.currency)}
        </p>
        {wallet.due_date ? (
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Погасить до {dateText(wallet.due_date)}
          </p>
        ) : null}

        {savings?.goal ? (
          <div className="mt-3">
            <span
              className="block h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: "var(--surface)" }}
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.min(Math.max(balance, 0) / savings.goal, 1) * 100}%`,
                  background: wallet.color,
                }}
              />
            </span>
            <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
              {left != null && left > 0
                ? `До цели ${formatMoney(savings.goal, wallet.currency)} осталось ${formatMoney(left, wallet.currency)}`
                : "Цель достигнута"}
            </p>
          </div>
        ) : null}
      </div>

      {savings ? (
        <div className="mb-4 space-y-2 text-sm">
          {savings.due.length ? (
            <div
              className="rounded-2xl p-3.5"
              style={{ background: "var(--surface-2)", border: "1px solid var(--accent)" }}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Проценты за{" "}
                    {spanText(savings.due[0].from, savings.due[savings.due.length - 1].to)}
                  </p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatMoney(
                      savings.due.reduce((sum, p) => sum + p.amount, 0),
                      wallet.currency,
                    )}
                  </p>
                </div>
                <button
                  onClick={accrue}
                  disabled={busy}
                  className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold text-white transition-transform duration-100 active:scale-95 disabled:opacity-40"
                  style={{ background: "var(--accent)" }}
                >
                  Начислить
                </button>
              </div>
              <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                {savings.due.length > 1
                  ? `За ${savings.due.length} ${plural(savings.due.length, "месяц", "месяца", "месяцев")} сразу, каждый — отдельной операцией. `
                  : ""}
                Прибавится к вкладу отдельной операцией, без дохода в отчётах — её можно
                поправить или удалить.
              </p>
            </div>
          ) : rate ? (
            <Row
              label={
                savings.since ? `Накапало с ${dateText(savings.since)}` : "Накапало"
              }
              value={formatMoney(savings.running, wallet.currency)}
            />
          ) : null}

          {savings.term ? (
            <Row
              label={`До конца срока (${dateText(savings.term)})`}
              value={
                savings.daysLeft != null && savings.daysLeft > 0
                  ? `${savings.daysLeft} ${plural(savings.daysLeft, "день", "дня", "дней")}`
                  : "срок вышел"
              }
            />
          ) : null}

          {savings.forecast != null && rate ? (
            <Row
              label="К концу срока примерно"
              value={formatMoney(savings.forecast, wallet.currency)}
            />
          ) : null}
        </div>
      ) : null}

      <Field
        label="Ручная корректировка"
        hint="Впиши фактический баланс — разница запишется отдельной операцией, история не пострадает"
      >
        <input
          className={inputClass}
          style={inputStyle}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>

      <p className="pb-2 text-xs" style={{ color: "var(--muted)" }}>
        {wallet.kind === "savings"
          ? "Пополнить — перетащи на этот кружок карту или доход. Снять — перетащи его на кошелёк. Прямо со вклада платить нельзя: сначала переведи деньги на карту."
          : "Чтобы записать трату — перетащи этот кошелёк на категорию расхода. Чтобы перекинуть деньги — на другой кошелёк."}
      </p>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
