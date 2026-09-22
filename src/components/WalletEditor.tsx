"use client";

import { useEffect, useState } from "react";
import { ICON_NAMES, Icon, PALETTE } from "@/lib/icons";
import { CURRENCIES, parseAmount } from "@/lib/money";
import type { Wallet, WalletKind } from "@/lib/types";
import { useStore } from "./DataProvider";
import { Button, Field, Sheet, inputClass, inputStyle } from "./ui";

export const KIND_LABEL: Record<WalletKind, string> = {
  cash: "Наличные",
  card: "Карта",
  debt_out: "Долг — я должен",
  debt_in: "Долг — мне должны",
};

const DEFAULT_ICON: Record<WalletKind, string> = {
  cash: "cash",
  card: "card",
  debt_out: "debt_out",
  debt_in: "debt_in",
};

export function WalletEditor({
  open,
  wallet,
  defaultKind = "card",
  onClose,
}: {
  open: boolean;
  wallet?: Wallet | null;
  defaultKind?: WalletKind;
  onClose: () => void;
}) {
  const { saveWallet, deleteWallet, profile } = useStore();
  const [kind, setKind] = useState<WalletKind>(defaultKind);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("card");
  const [color, setColor] = useState(PALETTE[3]);
  const [currency, setCurrency] = useState(profile?.base_currency ?? "KZT");
  const [initial, setInitial] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reminderDays, setReminderDays] = useState("3");
  const [monthlyPayment, setMonthlyPayment] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const k = wallet?.kind ?? defaultKind;
    setKind(k);
    setName(wallet?.name ?? "");
    setIcon(wallet?.icon ?? DEFAULT_ICON[k]);
    setColor(wallet?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)]);
    setCurrency(wallet?.currency ?? profile?.base_currency ?? "KZT");
    setInitial(wallet ? String(wallet.initial_balance) : "");
    setDueDate(wallet?.due_date ?? "");
    setReminderDays(wallet?.reminder_days != null ? String(wallet.reminder_days) : "3");
    setMonthlyPayment(wallet?.monthly_payment != null ? String(wallet.monthly_payment) : "");
    setIsRecurring(wallet?.is_recurring ?? false);
    setRecurringDay(wallet?.recurring_day != null ? String(wallet.recurring_day) : "");
  }, [open, wallet, defaultKind, profile]);

  const isDebt = kind === "debt_out" || kind === "debt_in";

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await saveWallet({
        id: wallet?.id,
        kind,
        name: name.trim(),
        icon,
        color,
        currency,
        initial_balance: parseAmount(initial) ?? 0,
        due_date: isDebt && dueDate ? dueDate : null,
        reminder_days: isDebt && reminderDays ? Number(reminderDays) : null,
        monthly_payment: isDebt ? parseAmount(monthlyPayment) : null,
        is_recurring: isDebt ? isRecurring : false,
        recurring_day: isDebt && isRecurring && recurringDay ? Number(recurringDay) : null,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={wallet ? "Кошелёк" : "Новый кошелёк"}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <Button onClick={submit} disabled={!name.trim() || busy}>
            Сохранить
          </Button>
          {wallet ? (
            <Button
              variant="ghost"
              onClick={async () => {
                await deleteWallet(wallet.id);
                onClose();
              }}
            >
              Убрать с экрана
            </Button>
          ) : null}
        </div>
      }
    >
      <Field label="Тип">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(KIND_LABEL) as WalletKind[]).map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setIcon(DEFAULT_ICON[k]);
              }}
              className="rounded-2xl border px-3 py-2.5 text-sm"
              style={{
                background: kind === k ? "var(--accent)" : "var(--surface-2)",
                borderColor: kind === k ? "var(--accent)" : "var(--border)",
                color: kind === k ? "#fff" : "inherit",
              }}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Название">
        <input
          className={inputClass}
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === "card" ? "Карта Kaspi" : kind === "debt_out" ? "Ипотека" : "Наличные"}
        />
      </Field>

      <Field label="Валюта">
        <div className="flex gap-2">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              onClick={() => setCurrency(c.code)}
              className="flex-1 rounded-2xl border px-3 py-2.5 text-sm"
              style={{
                background: currency === c.code ? "var(--accent)" : "var(--surface-2)",
                borderColor: currency === c.code ? "var(--accent)" : "var(--border)",
                color: currency === c.code ? "#fff" : "inherit",
              }}
            >
              {c.symbol} {c.code}
            </button>
          ))}
        </div>
      </Field>

      <Field
        label={isDebt ? "Сумма долга на старте" : "Баланс на старте"}
        hint="Дальше баланс меняется операциями — здесь только отправная точка"
      >
        <input
          className={inputClass}
          style={inputStyle}
          inputMode="decimal"
          value={initial}
          onChange={(e) => setInitial(e.target.value)}
          placeholder="0"
        />
      </Field>

      {isDebt ? (
        <>
          <Field label="Дата погашения">
            <input
              type="date"
              className={inputClass}
              style={inputStyle}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <Field label="Напомнить за (дней)">
            <input
              className={inputClass}
              style={inputStyle}
              inputMode="numeric"
              value={reminderDays}
              onChange={(e) => setReminderDays(e.target.value)}
            />
          </Field>
          <Field label="Платёж в месяц" hint="Для кредитов и подписок">
            <input
              className={inputClass}
              style={inputStyle}
              inputMode="decimal"
              value={monthlyPayment}
              onChange={(e) => setMonthlyPayment(e.target.value)}
              placeholder="необязательно"
            />
          </Field>
          <label className="mb-3 flex items-center gap-3">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
            />
            <span className="text-sm">Ежемесячный платёж</span>
          </label>
          {isRecurring ? (
            <Field label="Число месяца">
              <input
                className={inputClass}
                style={inputStyle}
                inputMode="numeric"
                value={recurringDay}
                onChange={(e) => setRecurringDay(e.target.value)}
                placeholder="10"
              />
            </Field>
          ) : null}
        </>
      ) : null}

      <Field label="Цвет">
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={c}
              className="h-8 w-8 rounded-full"
              style={{ background: c, outline: color === c ? "2px solid var(--text)" : "none", outlineOffset: 2 }}
            />
          ))}
        </div>
      </Field>

      <Field label="Иконка">
        <div className="grid grid-cols-6 gap-2">
          {ICON_NAMES.map((n) => (
            <button
              key={n}
              onClick={() => setIcon(n)}
              className="flex h-11 items-center justify-center rounded-xl"
              style={{
                background: icon === n ? color + "33" : "var(--surface-2)",
                color: icon === n ? color : "var(--muted)",
              }}
              aria-label={n}
            >
              <Icon name={n} size={20} />
            </button>
          ))}
        </div>
      </Field>
    </Sheet>
  );
}
