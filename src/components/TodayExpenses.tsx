"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Icon } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import { useStore } from "./DataProvider";

/**
 * Траты за сегодня на главном экране — список, а не только сумма.
 *
 * DailyAllowance уже показывает итог «сегодня X ₸» внутри дневного лимита,
 * но не разбивку: чтобы увидеть, что именно купили, раньше нужно было идти
 * в историю. Показываем только при наличии трат — пустая карточка тут
 * просто занимала бы место зря.
 */
export function TodayExpenses() {
  const { transactions, categories, profile, toBase } = useStore();
  const base = profile?.base_currency ?? "KZT";

  const items = useMemo(() => {
    const now = new Date();
    return transactions
      .filter((t) => {
        if (t.type !== "expense") return false;
        const at = new Date(t.occurred_at);
        return (
          at.getFullYear() === now.getFullYear() &&
          at.getMonth() === now.getMonth() &&
          at.getDate() === now.getDate()
        );
      })
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }, [transactions]);

  if (items.length === 0) return null;

  const total = items.reduce((sum, t) => sum + toBase(Number(t.amount), t.currency), 0);

  return (
    <Link
      href="/money/operations"
      className="mb-3 block overflow-hidden rounded-2xl transition active:scale-[0.99]"
      style={{ background: "var(--surface)" }}
    >
      <div className="flex items-center justify-between px-4 pt-3.5">
        <p className="text-[0.8125rem] font-medium">Траты сегодня</p>
        <p className="text-[0.8125rem] font-semibold tabular-nums" style={{ color: "var(--danger)" }}>
          −{formatMoney(total, base)}
        </p>
      </div>
      <div className="mt-1">
        {items.slice(0, 5).map((t, index) => {
          const category = categories.find((c) => c.id === t.category_id);
          const sub = categories.find((c) => c.id === t.subcategory_id);
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 px-4 py-2"
              style={{ borderTop: index ? "1px solid var(--border)" : undefined }}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: category?.color ?? "var(--muted)" }}
              >
                <Icon name={category?.icon ?? "circle"} size={14} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[0.8125rem]">
                {category?.name ?? "Без категории"}
                {sub ? ` → ${sub.name}` : ""}
              </span>
              <span className="shrink-0 text-[0.8125rem] tabular-nums" style={{ color: "var(--muted)" }}>
                {formatMoney(Number(t.amount), t.currency)}
              </span>
            </div>
          );
        })}
      </div>
      {items.length > 5 ? (
        <p className="px-4 pb-3 pt-1 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          и ещё {items.length - 5} — вся история →
        </p>
      ) : (
        <div className="pb-3" />
      )}
    </Link>
  );
}
