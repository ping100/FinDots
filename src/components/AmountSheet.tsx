"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/lib/icons";
import { formatMoney, parseAmount, symbolOf } from "@/lib/money";
import type { CurrencyCode } from "@/lib/types";
import { Button, Field, Sheet, inputClass, inputStyle } from "./ui";

export interface AmountResult {
  amount: number;
  note: string;
  occurredAt: string;
  optionId?: string;
}

/**
 * Ввод суммы: крупное табло + собственная цифровая клавиатура.
 * Системную клавиатуру на телефоне не открываем — она перекрывает половину
 * экрана и на iOS уводит вёрстку.
 */
export function AmountSheet({
  open,
  title,
  subtitle,
  currency,
  initial,
  max,
  options,
  optionLabel,
  submitLabel = "Готово",
  extra,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  currency: CurrencyCode;
  initial?: number;
  /** Верхняя граница (нераспределённый доход или баланс кошелька). */
  max?: number;
  /** Необязательный выбор второго участника операции — например, откуда списать. */
  options?: { id: string; name: string; caption?: string }[];
  optionLabel?: string;
  submitLabel?: string;
  /** Дополнительная кнопка под подзаголовком — например, «настроить категорию». */
  extra?: ReactNode;
  onSubmit: (result: AmountResult) => Promise<void> | void;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [optionId, setOptionId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRaw(initial != null && initial > 0 ? trimZeros(initial) : "");
    setNote("");
    setDate(new Date().toISOString().slice(0, 10));
    setOptionId(options?.[0]?.id);
    setProblem(null);
  }, [open, initial, options]);

  const amount = parseAmount(raw) ?? 0;
  const overMax = max != null && amount > max + 0.004;
  const valid = amount > 0 && !overMax && (!options?.length || !!optionId);

  const press = (key: string) => {
    setProblem(null);
    setRaw((prev) => {
      if (key === "del") return prev.slice(0, -1);
      if (key === ",") return prev.includes(",") ? prev : (prev || "0") + ",";
      if (prev.includes(",") && prev.split(",")[1].length >= 2) return prev;
      if (prev === "0") return key;
      return prev + key;
    });
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onSubmit({
        amount,
        note,
        occurredAt: new Date(date + "T" + new Date().toTimeString().slice(0, 8)).toISOString(),
        optionId,
      });
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Не получилось сохранить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <Button onClick={submit} disabled={!valid || busy}>
          {busy ? "Сохраняю…" : submitLabel}
        </Button>
      }
    >
      {subtitle ? (
        <p className="mb-2 text-sm" style={{ color: "var(--muted)" }}>
          {subtitle}
        </p>
      ) : null}

      {extra}

      <div className="mb-1 flex items-baseline justify-center gap-1 py-3">
        <span className="text-4xl font-bold tabular-nums">{group(raw) || "0"}</span>
        <span className="text-xl" style={{ color: "var(--muted)" }}>
          {symbolOf(currency)}
        </span>
      </div>

      {max != null ? (
        <button
          onClick={() => setRaw(trimZeros(max))}
          className="mx-auto mb-3 block rounded-full px-3 py-1 text-xs"
          style={{ background: "var(--surface-2)", color: "var(--muted)" }}
        >
          Доступно {formatMoney(max, currency)} — вставить полностью
        </button>
      ) : null}

      {overMax ? (
        <p className="mb-2 text-center text-xs" style={{ color: "var(--danger)" }}>
          Больше доступного остатка
        </p>
      ) : null}

      <div className="mb-4 grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "del"].map((key) => (
          <button
            key={key}
            onClick={() => press(key)}
            className="flex h-12 items-center justify-center rounded-2xl text-xl font-semibold active:scale-95"
            style={{ background: "var(--surface-2)" }}
          >
            {key === "del" ? <Icon name="close" size={20} /> : key}
          </button>
        ))}
      </div>

      {options?.length ? (
        <Field label={optionLabel ?? "Откуда"}>
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <button
                key={option.id}
                onClick={() => setOptionId(option.id)}
                className="rounded-2xl border px-3 py-2 text-left text-sm"
                style={{
                  background: optionId === option.id ? "var(--accent)" : "var(--surface-2)",
                  borderColor: optionId === option.id ? "var(--accent)" : "var(--border)",
                  color: optionId === option.id ? "#fff" : "inherit",
                }}
              >
                <span className="block font-medium">{option.name}</span>
                {option.caption ? (
                  <span className="block text-[0.6875rem] opacity-70">{option.caption}</span>
                ) : null}
              </button>
            ))}
          </div>
        </Field>
      ) : null}

      <Field label="Комментарий">
        <input
          className={inputClass}
          style={inputStyle}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="необязательно"
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

      {problem ? (
        <p className="pb-2 text-sm" style={{ color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}
    </Sheet>
  );
}

/** Разряды через пробел прямо во время набора: 480000 → 480 000 */
function group(raw: string): string {
  if (!raw) return "";
  const [whole, fraction] = raw.split(",");
  const spaced = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u2009");
  return fraction != null ? `${spaced},${fraction}` : spaced;
}

function trimZeros(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace(".", ",");
}
