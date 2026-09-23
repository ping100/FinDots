"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/lib/icons";
import { formatMoney, parseAmount, symbolOf } from "@/lib/money";
import type { CurrencyCode } from "@/lib/types";
import { Button, Field, FieldGroup, Sheet, inputClass, inputStyle } from "./ui";

export interface AmountResult {
  amount: number;
  note: string;
  occurredAt: string;
  optionId?: string;
  subcategoryId?: string | null;
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
  subcategories,
  onAddSubcategory,
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
  /** Уточнения внутри категории: «Продукты → Магазин, Базар». */
  subcategories?: { id: string; name: string }[];
  /** Завести новое уточнение, не выходя из окна; возвращает его id. */
  onAddSubcategory?: (name: string) => Promise<string>;
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
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Начальные значения читаем через ref: вызывающий код пересоздаёт options
  // на каждом рендере, и если подписаться на них, форма будет обнуляться от
  // любого обновления данных — например, стоит завести уточнение, как уже
  // набранная сумма слетает.
  const start = useRef({ initial, firstOption: options?.[0]?.id });
  start.current = { initial, firstOption: options?.[0]?.id };

  useEffect(() => {
    if (!open) return;
    const { initial: from, firstOption } = start.current;
    setRaw(from != null && from > 0 ? trimZeros(from) : "");
    setNote("");
    setDate(new Date().toISOString().slice(0, 10));
    setOptionId(firstOption);
    setSubcategoryId(null);
    setAdding(false);
    setNewSub("");
    setProblem(null);
  }, [open]);

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

  const createSub = async () => {
    const name = newSub.trim();
    if (!name || !onAddSubcategory) return;
    setProblem(null);
    try {
      setSubcategoryId(await onAddSubcategory(name));
      setNewSub("");
      setAdding(false);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Не получилось добавить уточнение");
    }
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
        subcategoryId,
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

      {subcategories || onAddSubcategory ? (
        <FieldGroup label="Уточнение">
          <div className="flex flex-wrap gap-2">
            <Chip active={subcategoryId === null} onClick={() => setSubcategoryId(null)}>
              без уточнения
            </Chip>
            {subcategories?.map((sub) => (
              <Chip
                key={sub.id}
                active={subcategoryId === sub.id}
                onClick={() => setSubcategoryId(sub.id)}
              >
                {sub.name}
              </Chip>
            ))}
            {onAddSubcategory && !adding ? (
              <Chip onClick={() => setAdding(true)}>
                <span className="flex items-center gap-1">
                  <Icon name="plus" size={13} />
                  Добавить
                </span>
              </Chip>
            ) : null}
          </div>

          {adding ? (
            <div className="mt-2 flex gap-2">
              <input
                autoFocus
                className={inputClass}
                style={inputStyle}
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                placeholder="Магазин, базар, доставка…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void createSub();
                  }
                  if (e.key === "Escape") setAdding(false);
                }}
              />
              <button
                onClick={() => void createSub()}
                disabled={!newSub.trim()}
                className="shrink-0 rounded-2xl px-4 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: "var(--accent)" }}
              >
                ОК
              </button>
            </div>
          ) : null}
        </FieldGroup>
      ) : null}

      {options?.length ? (
        <FieldGroup label={optionLabel ?? "Откуда"}>
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
        </FieldGroup>
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

/** Чип уточнения: выбранный залит акцентом, остальные — как поле ввода. */
function Chip({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-3.5 py-2 text-sm transition active:scale-95"
      style={{
        background: active ? "var(--accent)" : "var(--surface-2)",
        borderColor: active ? "var(--accent)" : "var(--border)",
        color: active ? "#fff" : "inherit",
      }}
    >
      {children}
    </button>
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
