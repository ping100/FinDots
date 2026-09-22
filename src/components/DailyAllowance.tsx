"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";
import { useStore } from "./DataProvider";
import { Sheet } from "./ui";

/**
 * «Сколько можно потратить сегодня» — то число, ради которого трекер вообще
 * открывают.
 *
 *   (деньги в кошельках − обязательные платежи до конца месяца) ÷ дней осталось
 *
 * Считается от текущих балансов, поэтому само себя выправляет: перебрал
 * сегодня — завтрашняя цифра станет меньше, и наоборот.
 */
export function DailyAllowance() {
  const { wallets, transactions, profile, balanceOf, toBase } = useStore();
  const [explain, setExplain] = useState(false);
  const base = profile?.base_currency ?? "KZT";

  const data = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysInMonth = new Date(monthEnd.getTime() - 1).getDate();
    const daysLeft = daysInMonth - now.getDate() + 1;

    const money = wallets
      .filter((w) => w.kind === "cash" || w.kind === "card")
      .reduce((sum, w) => sum + toBase(balanceOf(w.id), w.currency), 0);

    // Обязательства этого месяца, которые ещё впереди: либо регулярный
    // платёж, чьё число не прошло, либо долг со сроком внутри остатка месяца.
    const upcoming: { name: string; amount: number }[] = [];
    for (const wallet of wallets) {
      if (wallet.kind !== "debt_out") continue;

      if (wallet.is_recurring && wallet.recurring_day != null && wallet.monthly_payment) {
        if (wallet.recurring_day >= now.getDate()) {
          upcoming.push({
            name: wallet.name,
            amount: toBase(wallet.monthly_payment, wallet.currency),
          });
        }
        continue;
      }

      if (wallet.due_date) {
        const due = new Date(wallet.due_date);
        if (due >= today && due < monthEnd) {
          const left = toBase(balanceOf(wallet.id), wallet.currency);
          if (left > 0) upcoming.push({ name: wallet.name, amount: left });
        }
      }
    }

    const obligations = upcoming.reduce((sum, item) => sum + item.amount, 0);
    const free = money - obligations;

    const spentToday = transactions.reduce((sum, t) => {
      if (t.type !== "expense") return sum;
      const at = new Date(t.occurred_at);
      if (at < today || at >= monthEnd) return sum;
      if (at.getDate() !== now.getDate()) return sum;
      return sum + toBase(Number(t.amount), t.currency);
    }, 0);

    return {
      money,
      obligations,
      upcoming,
      daysLeft,
      spentToday,
      perDay: free / Math.max(daysLeft, 1),
      short: free < 0,
    };
  }, [wallets, transactions, balanceOf, toBase]);

  const overspent = data.spentToday > data.perDay && data.perDay > 0;

  return (
    <>
      <button
        onClick={() => setExplain(true)}
        className="mb-4 w-full rounded-2xl px-4 py-3 text-left transition-transform duration-100 active:scale-[0.99]"
        style={{ background: "var(--surface)" }}
      >
        <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          {data.short ? "Не хватает на обязательные платежи" : "Можно тратить сегодня"}
        </p>
        <p
          className="text-[1.625rem] font-bold leading-tight tabular-nums"
          style={{ color: data.short ? "var(--danger)" : "var(--text)" }}
        >
          {formatMoney(data.short ? data.obligations - data.money : data.perDay, base)}
        </p>
        <p className="mt-0.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          осталось {data.daysLeft} {plural(data.daysLeft, "день", "дня", "дней")}
          {data.spentToday > 0 ? (
            <>
              {" · сегодня "}
              <span style={{ color: overspent ? "var(--danger)" : "var(--muted)" }}>
                {formatMoney(data.spentToday, base)}
              </span>
            </>
          ) : null}
        </p>
      </button>

      <Sheet open={explain} title="Откуда это число" onClose={() => setExplain(false)}>
        <div className="space-y-2 pb-3 text-sm">
          <Row label="В кошельках и на картах" value={formatMoney(data.money, base)} />
          {data.upcoming.map((item) => (
            <Row
              key={item.name}
              label={`− ${item.name}`}
              value={formatMoney(item.amount, base)}
              muted
            />
          ))}
          {data.upcoming.length === 0 ? (
            <Row label="Обязательных платежей до конца месяца нет" value="" muted />
          ) : null}
          <Row
            label={`÷ ${data.daysLeft} ${plural(data.daysLeft, "день", "дня", "дней")} до конца месяца`}
            value=""
            muted
          />
          <div className="!mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <Row
              label={data.short ? "Не хватает" : "На день"}
              value={formatMoney(
                data.short ? data.obligations - data.money : data.perDay,
                base,
              )}
              strong
            />
          </div>
        </div>
        <p className="pb-2 text-xs" style={{ color: "var(--muted)" }}>
          Обязательные — это долги и кредиты с ежемесячным платежом, чьё число
          ещё не прошло, и долги со сроком погашения внутри остатка месяца.
          Цифра считается от текущих балансов, поэтому сама себя выправляет:
          перебрали сегодня — завтра она станет меньше.
        </p>
      </Sheet>
    </>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ color: muted ? "var(--muted)" : undefined }}>{label}</span>
      <span
        className={`tabular-nums ${strong ? "text-base font-semibold" : ""}`}
        style={{ color: muted && !value ? "var(--muted)" : undefined }}
      >
        {value}
      </span>
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
