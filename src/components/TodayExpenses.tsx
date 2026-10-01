"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  const [collapsed, setCollapsed] = useState(false);

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
    <div className="mb-3 overflow-hidden rounded-2xl" style={{ background: "var(--surface)" }}>
      <button
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between px-4 py-3.5"
      >
        <span className="flex items-center gap-1.5">
          <Icon
            name={collapsed ? "chevron-right" : "chevron-down"}
            size={14}
            style={{ color: "var(--muted)" }}
          />
          <span className="text-[0.8125rem] font-medium">Траты сегодня</span>
        </span>
        <span className="text-[0.8125rem] font-semibold tabular-nums" style={{ color: "var(--danger)" }}>
          −{formatMoney(total, base)}
        </span>
      </button>
      {collapsed ? null : (
        <>
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
          <Link
            href="/money/operations"
            className="block px-4 pb-3 pt-1 text-[0.6875rem] transition active:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            {items.length > 5 ? `и ещё ${items.length - 5} — вся история →` : "вся история →"}
          </Link>
        </>
      )}
    </div>
  );
}
