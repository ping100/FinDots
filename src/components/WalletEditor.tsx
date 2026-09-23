"use client";

import { useEffect, useState } from "react";
import { PALETTE } from "@/lib/icons";
import { CURRENCIES, parseAmount } from "@/lib/money";
import { toISODate } from "@/lib/savings";
import type { Wallet, WalletKind } from "@/lib/types";
import { useStore } from "./DataProvider";
import { Button, ColorPicker, Field, FieldGroup, IconPicker, Sheet, inputClass, inputStyle } from "./ui";

export const KIND_LABEL: Record<WalletKind, string> = {
  cash: "Наличные",
  card: "Карта",
  savings: "Вклад или копилка",
  debt_out: "Долг — я должен",
  debt_in: "Долг — мне должны",
};

/** Заголовок под то, что человек и правда заводит: не «кошелёк» для долга. */
const NEW_TITLE: Record<WalletKind, string> = {
  cash: "Новый кошелёк",
  card: "Новый кошелёк",
  savings: "Новый вклад или копилка",
  debt_out: "Новый долг или кредит",
  debt_in: "Мне должны",
};

const DEFAULT_ICON: Record<WalletKind, string> = {
  cash: "cash",
  card: "card",
  savings: "savings",
  debt_out: "debt_out",
  debt_in: "debt_in",
};

export function WalletEditor({
  open,
  wallet,
  defaultKind = "card",
  kinds,
  onClose,
}: {
  open: boolean;
  wallet?: Wallet | null;
  defaultKind?: WalletKind;
  /**
   * Что вообще можно завести в этом месте. На странице долгов незачем
   * предлагать завести наличные, а в блоке накоплений — долг.
   */
  kinds?: WalletKind[];
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
  const [rate, setRate] = useState("");
  const [openedOn, setOpenedOn] = useState("");
  const [termEnd, setTermEnd] = useState("");
  const [goal, setGoal] = useState("");
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
    setRate(wallet?.rate != null ? String(wallet.rate) : "");
    setOpenedOn(wallet?.opened_on ?? toISODate(new Date()));
    setTermEnd(wallet?.term_end ?? "");
    setGoal(wallet?.goal != null ? String(wallet.goal) : "");
  }, [open, wallet, defaultKind, profile]);

  const isDebt = kind === "debt_out" || kind === "debt_in";
  const isSavings = kind === "savings";
  // Тип существующего кошелька не меняем: у долга поток инвертирован, и
  // превращение карты в долг перевернуло бы всю его историю.
  const choices = wallet ? [] : (kinds ?? (Object.keys(KIND_LABEL) as WalletKind[]));

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
        rate: isSavings ? parseAmount(rate) : null,
        opened_on: isSavings ? openedOn || toISODate(new Date()) : null,
        term_end: isSavings && termEnd ? termEnd : null,
        goal: isSavings ? parseAmount(goal) : null,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={wallet ? "Кошелёк" : NEW_TITLE[kind]}
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
      {choices.length > 1 ? (
      <FieldGroup label="Тип">
        <div className="grid grid-cols-2 gap-2">
          {choices.map((k) => (
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
      </FieldGroup>
      ) : null}

      <Field label="Название">
        <input
          className={inputClass}
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            kind === "card"
              ? "Карта Kaspi"
              : kind === "savings"
                ? "Вклад на отпуск"
                : kind === "debt_out"
                  ? "Ипотека"
                  : "Наличные"
          }
        />
      </Field>

      <FieldGroup label="Валюта">
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
      </FieldGroup>

      <Field
        label={isDebt ? "Сумма долга на старте" : isSavings ? "Уже накоплено" : "Баланс на старте"}
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

      {isSavings ? (
        <>
          <Field
            label="Ставка, % годовых"
            hint="Пусто — обычная копилка, проценты не считаются"
          >
            <input
              className={inputClass}
              style={inputStyle}
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="например, 16,5"
            />
          </Field>
          <Field label="Дата открытия" hint="С этого дня начинают капать проценты">
            <input
              type="date"
              className={inputClass}
              style={inputStyle}
              value={openedOn}
              onChange={(e) => setOpenedOn(e.target.value)}
            />
          </Field>
          <Field label="Конец срока" hint="Необязательно — для бессрочной копилки оставь пустым">
            <input
              type="date"
              className={inputClass}
              style={inputStyle}
              value={termEnd}
              onChange={(e) => setTermEnd(e.target.value)}
            />
          </Field>
          <Field label="Цель" hint="Появится полоска прогресса под кружком">
            <input
              className={inputClass}
              style={inputStyle}
              inputMode="decimal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="например, 1 000 000"
            />
          </Field>
        </>
      ) : null}

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

      <ColorPicker value={color} onChange={setColor} />
      <IconPicker value={icon} color={color} onChange={setIcon} />
    </Sheet>
  );
}
