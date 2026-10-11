"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import { formatMoney, monthRange } from "@/lib/money";
import { isFee } from "@/lib/fee";
import type { Category, CurrencyCode, Transaction } from "@/lib/types";
import { SERIES } from "./charts";

const HEADS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
/**
 * Пять ступеней одного цвета — цвета расходов, как на остальных графиках.
 * Смешиваем с фоном карточки, а не с белым: так ступени остаются
 * ступенями и в тёмной теме.
 */
const STEPS = [22, 40, 58, 78, 100];

/**
 * Календарь трат: месяц сеткой, чем темнее день — тем больше потрачено.
 * Нажали на день — под календарём его траты. Сверху два факта, которые
 * иначе пришлось бы высчитывать: самый дорогой день и дни без трат.
 */
export function SpendCalendar({
  transactions,
  categories,
  offset,
  currency,
  toBase,
}: {
  transactions: Transaction[];
  categories: Category[];
  offset: number;
  currency: CurrencyCode;
  toBase: (amount: number, currency: CurrencyCode) => number;
}) {
  const [picked, setPicked] = useState<number | null>(null);

  const month = useMemo(() => {
    const { from, to } = monthRange(offset);
    const days = Math.round((to.getTime() - from.getTime()) / 86400000);
    const sums = new Array<number>(days + 1).fill(0);
    const byDay = new Map<number, Transaction[]>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const at = new Date(t.occurred_at);
      if (at < from || at >= to) continue;
      const d = at.getDate();
      sums[d] += toBase(Number(t.amount), t.currency);
      byDay.set(d, [...(byDay.get(d) ?? []), t]);
    }
    const max = Math.max(0, ...sums);
    const now = new Date();
    const isCurrent = now >= from && now < to;
    const lastDay = isCurrent ? now.getDate() : days;
    let top = 0;
    for (let d = 1; d <= days; d++) if (sums[d] > sums[top]) top = d;
    const empty = Array.from({ length: lastDay }, (_, i) => i + 1).filter((d) => sums[d] === 0).length;
    return {
      from,
      days,
      sums,
      byDay,
      max,
      today: isCurrent ? now.getDate() : null,
      lastDay,
      top: sums[top] > 0 ? top : null,
      empty,
      // Понедельник — первый столбец.
      lead: (from.getDay() + 6) % 7,
    };
  }, [transactions, offset, toBase]);

  const step = (sum: number) => {
    if (sum <= 0 || month.max <= 0) return null;
    // Ступень по доле от самого дорогого дня: даже маленькая трата видна.
    return STEPS[Math.min(STEPS.length - 1, Math.floor((sum / month.max) * STEPS.length))];
  };
  const fill = (pct: number | null) =>
    pct == null ? "var(--surface-2)" : `color-mix(in srgb, ${SERIES.expense.color} ${pct}%, var(--surface))`;

  const dayLabel = (d: number) =>
    new Date(month.from.getFullYear(), month.from.getMonth(), d).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      weekday: "short",
    });

  const list = picked ? (month.byDay.get(picked) ?? []) : [];
  const nameOf = (t: Transaction) => {
    if (isFee(t)) return { name: "Комиссия", icon: "percent", color: "var(--muted)" };
    const c = categories.find((x) => x.id === t.category_id);
    return { name: c?.name ?? "Без категории", icon: c?.icon ?? "receipt", color: c?.color ?? "var(--muted)" };
  };

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Fact
          label="Самый дорогой день"
          value={month.top ? formatMoney(month.sums[month.top], currency) : "—"}
          hint={month.top ? dayLabel(month.top) : "трат не было"}
        />
        <Fact
          label="Дней без трат"
          value={`${month.empty} из ${month.lastDay}`}
          hint={month.today ? "по сегодня включительно" : "за весь месяц"}
        />
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {HEADS.map((h) => (
          <span key={h} className="pb-0.5 text-center text-[0.625rem]" style={{ color: "var(--muted)" }}>
            {h}
          </span>
        ))}
        {Array.from({ length: month.lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length: month.days }, (_, i) => {
          const d = i + 1;
          const future = month.today != null && d > month.today;
          const pct = step(month.sums[d]);
          const dark = pct != null && pct >= 58;
          const on = picked === d;
          return (
            <button
              key={d}
              disabled={future}
              onClick={() => setPicked(on ? null : d)}
              aria-label={`${dayLabel(d)}: ${month.sums[d] > 0 ? formatMoney(month.sums[d], currency) : "без трат"}`}
              aria-pressed={on}
              className="relative flex aspect-square items-center justify-center rounded-xl text-[0.8125rem] tabular-nums transition active:scale-90 disabled:opacity-35"
              style={{
                background: future ? "transparent" : fill(pct),
                color: dark ? "#fff" : "var(--text)",
                fontWeight: d === month.today ? 700 : 500,
                // Сегодня — обводкой цвета текста, выбранный — акцентом.
                boxShadow: on
                  ? "0 0 0 2px var(--accent)"
                  : d === month.today
                    ? "inset 0 0 0 1.5px var(--text)"
                    : undefined,
              }}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* Легенда: ступени насыщенности и что они значат. */}
      <div className="mt-3 flex items-center justify-center gap-1.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        <span>без трат</span>
        <span className="h-3 w-3 rounded" style={{ background: fill(null) }} />
        {STEPS.map((pct) => (
          <span key={pct} className="h-3 w-3 rounded" style={{ background: fill(pct) }} />
        ))}
        <span>больше</span>
      </div>

      {picked ? (
        <div className="animate-rise mt-4 rounded-2xl p-3" style={{ background: "var(--surface-2)" }}>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <span className="text-sm font-semibold first-letter:uppercase">{dayLabel(picked)}</span>
            <span className="text-sm font-semibold tabular-nums">{formatMoney(month.sums[picked], currency)}</span>
          </div>
          {list.length === 0 ? (
            <p className="px-1 pb-1 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
              В этот день трат не было
            </p>
          ) : (
            <div className="space-y-1">
              {list.map((t) => {
                const who = nameOf(t);
                return (
                  <div key={t.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5" style={{ background: "var(--surface)" }}>
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ background: who.color }}
                    >
                      <Icon name={who.icon} size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem]">{who.name}</span>
                      {t.note ? (
                        <span className="block truncate text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                          {t.note}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[0.8125rem] font-medium tabular-nums">
                      {formatMoney(Number(t.amount), t.currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-center text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          Нажмите на день — покажу его траты
        </p>
      )}
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "var(--surface-2)" }}>
      <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <span className="block text-[0.9375rem] font-semibold tabular-nums">{value}</span>
      <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        {hint}
      </span>
    </div>
  );
}
