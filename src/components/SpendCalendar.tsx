"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import { formatMoney, monthRange } from "@/lib/money";
import { isFee } from "@/lib/fee";
import type { Category, CurrencyCode, Transaction } from "@/lib/types";
import { SERIES } from "./charts";

const HEADS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
/** Кружок дня: от самого скромного до самого дорогого дня месяца. */
const MIN_D = 18;
const MAX_D = 34;

/**
 * Календарь трат в стиле Dots: каждый день — кружок, как на главном
 * экране. Размер — сколько потрачено (по площади, чтобы вдвое большая
 * сумма не выглядела вчетверо больше), цвет — категория, на которую в тот
 * день ушло больше всего. Нажали на день — под календарём его траты.
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
    // Сколько в каждый день ушло по каждой категории — чтобы покрасить кружок.
    const perCat = new Map<number, Map<string, number>>();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const at = new Date(t.occurred_at);
      if (at < from || at >= to) continue;
      const d = at.getDate();
      const value = toBase(Number(t.amount), t.currency);
      sums[d] += value;
      byDay.set(d, [...(byDay.get(d) ?? []), t]);
      const key = isFee(t) ? "fee" : (t.category_id ?? "none");
      const cats = perCat.get(d) ?? new Map<string, number>();
      cats.set(key, (cats.get(key) ?? 0) + value);
      perCat.set(d, cats);
    }
    const max = Math.max(0, ...sums);
    const now = new Date();
    const isCurrent = now >= from && now < to;
    const lastDay = isCurrent ? now.getDate() : days;
    let top = 0;
    for (let d = 1; d <= days; d++) if (sums[d] > sums[top]) top = d;
    const empty = Array.from({ length: lastDay }, (_, i) => i + 1).filter((d) => sums[d] === 0).length;
    const lead = new Map<number, string>();
    for (const [d, cats] of perCat) lead.set(d, [...cats].sort((a, b) => b[1] - a[1])[0][0]);
    return {
      from,
      days,
      sums,
      byDay,
      leadCat: lead,
      max,
      today: isCurrent ? now.getDate() : null,
      lastDay,
      top: sums[top] > 0 ? top : null,
      empty,
      // Понедельник — первый столбец.
      lead: (from.getDay() + 6) % 7,
    };
  }, [transactions, offset, toBase]);

  const diameter = (sum: number) =>
    sum <= 0 || month.max <= 0 ? 0 : MIN_D + (MAX_D - MIN_D) * Math.sqrt(sum / month.max);
  const colorOf = (d: number) => {
    const id = month.leadCat.get(d);
    if (id === "fee") return "#8b97a8";
    return categories.find((c) => c.id === id)?.color ?? SERIES.expense.color;
  };

  const dayLabel = (d: number) =>
    new Date(month.from.getFullYear(), month.from.getMonth(), d).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      weekday: "short",
    });

  const shortLabel = (d: number) =>
    new Date(month.from.getFullYear(), month.from.getMonth(), d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");

  const list = picked ? (month.byDay.get(picked) ?? []) : [];
  const nameOf = (t: Transaction) => {
    if (isFee(t)) return { name: "Комиссия", icon: "percent", color: "var(--muted)" };
    const c = categories.find((x) => x.id === t.category_id);
    return { name: c?.name ?? "Без категории", icon: c?.icon ?? "receipt", color: c?.color ?? "var(--muted)" };
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {month.top ? (
          <Fact label="Макс." value={formatMoney(month.sums[month.top], currency)} hint={shortLabel(month.top)} />
        ) : null}
        <Fact label="Без трат" value={`${month.empty} из ${month.lastDay}`} hint="дн." />
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
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
          const size = diameter(month.sums[d]);
          const on = picked === d;
          const isToday = d === month.today;
          return (
            <button
              key={d}
              disabled={future}
              onClick={() => setPicked(on ? null : d)}
              aria-label={`${dayLabel(d)}: ${month.sums[d] > 0 ? formatMoney(month.sums[d], currency) : "без трат"}`}
              aria-pressed={on}
              className="relative flex h-10 items-center justify-center transition active:scale-90 disabled:opacity-30"
            >
              {size ? (
                <span
                  className="absolute rounded-full"
                  style={{
                    width: size,
                    height: size,
                    background: colorOf(d),
                    boxShadow: on ? "0 0 0 2px var(--surface), 0 0 0 4px var(--accent)" : undefined,
                  }}
                />
              ) : on || isToday ? (
                <span
                  className="absolute h-7 w-7 rounded-full"
                  style={{
                    boxShadow: on ? "inset 0 0 0 2px var(--accent)" : "inset 0 0 0 1.5px var(--text)",
                  }}
                />
              ) : null}
              <span
                className="relative text-[0.6875rem] tabular-nums"
                style={{
                  color: size ? "#fff" : "var(--muted)",
                  fontWeight: isToday ? 800 : size ? 600 : 400,
                  textDecoration: isToday && size ? "underline" : undefined,
                  textUnderlineOffset: 2,
                }}
              >
                {d}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 text-center text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        Цвет кружка — категория, на которую ушло больше всего
      </p>

      {picked ? (
        <div className="animate-rise mt-3 rounded-2xl p-3" style={{ background: "var(--surface-2)" }}>
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
      ) : null}
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-baseline gap-1 whitespace-nowrap rounded-full px-3 py-1 text-[0.75rem]" style={{ background: "var(--surface-2)" }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
      {hint ? <span style={{ color: "var(--muted)" }}>{hint}</span> : null}
    </div>
  );
}
