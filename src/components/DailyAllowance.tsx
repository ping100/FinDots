"use client";

import { useMemo, useState } from "react";
import { formatMoney, symbolOf } from "@/lib/money";
import { DEFAULT_SHOWN, crossRate, formatRate, labelFor, perFor, useOfficialRates } from "@/lib/officialRates";
import type { CurrencyCode } from "@/lib/types";
import { SERIES } from "./charts";
import { toISODate } from "@/lib/savings";
import { useStore } from "./DataProvider";
import { Sheet } from "./ui";
import { AnimatedMoney } from "./AnimatedMoney";

/**
 * Шапка главного экрана: сколько всего денег и сколько из них можно потратить
 * сегодня.
 *
 * Баланс идёт первым, потому что это факт, а дневная цифра — производная:
 *
 *   (деньги в кошельках − обязательные платежи до конца месяца) ÷ дней осталось
 *
 * Считается от текущих балансов, поэтому сама себя выправляет: перебрал
 * сегодня — завтрашняя цифра станет меньше, и наоборот.
 */
export function DailyAllowance() {
  const { wallets, categories, transactions, profile, rates, balanceOf, toBase } = useStore();
  const [explain, setExplain] = useState(false);
  const base = profile?.base_currency ?? "KZT";

  const data = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysInMonth = new Date(monthEnd.getTime() - 1).getDate();
    const daysLeft = daysInMonth - now.getDate() + 1;

    const live = wallets.filter((w) => !w.archived);
    const of = (kind: string) =>
      live
        .filter((w) => w.kind === kind)
        .reduce((sum, w) => sum + toBase(balanceOf(w.id), w.currency), 0);

    const money = of("cash") + of("card");
    const saved = of("savings");
    // Остаток по долгам и кредитам — показываем рядом, но из баланса не
    // вычитаем: «сколько у меня денег» и «сколько я должен» — разные вопросы.
    const owed = of("debt_out");

    // Обязательства этого месяца, которые ещё впереди: либо регулярный
    // платёж, чьё число не прошло, либо долг со сроком внутри остатка месяца.
    const upcoming: { name: string; amount: number }[] = [];
    for (const wallet of wallets) {
      if (wallet.archived || wallet.kind !== "debt_out") continue;

      if (wallet.is_recurring && wallet.recurring_day != null && wallet.monthly_payment) {
        if (wallet.recurring_day >= now.getDate()) {
          // Платёж за этот месяц уже мог уйти («Внести платёж» раньше срока) —
          // тогда деньги уже списаны с баланса, и резервировать их ещё раз
          // не нужно: иначе «можно тратить» дважды теряет одну и ту же сумму.
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const paidThisMonth = transactions.reduce((sum, t) => {
            if (t.type !== "transfer" || t.to_wallet_id !== wallet.id) return sum;
            const at = new Date(t.occurred_at);
            if (at < monthStart || at >= monthEnd) return sum;
            return sum + toBase(Number(t.amount), t.currency);
          }, 0);
          const remaining = toBase(wallet.monthly_payment, wallet.currency) - paidThisMonth;
          if (remaining > 0.5) upcoming.push({ name: wallet.name, amount: remaining });
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

    // Регулярные траты: аренда, подписки. Из свободных денег держим в
    // стороне только неоплаченный остаток — заплатил половину, половина и
    // вернётся в доступные.
    const spentByCategory = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== "expense" || !t.category_id) continue;
      const at = new Date(t.occurred_at);
      if (at < new Date(now.getFullYear(), now.getMonth(), 1) || at >= monthEnd) continue;
      spentByCategory.set(
        t.category_id,
        (spentByCategory.get(t.category_id) ?? 0) + toBase(Number(t.amount), t.currency),
      );
    }
    const thisMonth = toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
    for (const category of categories) {
      if (category.archived || category.kind !== "expense" || !category.planned_amount) continue;
      // Отметили «уже оплачено» вручную — например, занесли трату позже или
      // заплатили вне приложения. Следующий месяц метка не действует.
      if (category.paid_month === thisMonth) continue;
      const left = Number(category.planned_amount) - (spentByCategory.get(category.id) ?? 0);
      if (left > 0.5) upcoming.push({ name: category.name, amount: left });
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

    // Траты по дням этого месяца — для мини-графика под карточкой.
    const daily = new Array<number>(daysInMonth).fill(0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const at = new Date(t.occurred_at);
      if (at < monthStart || at >= monthEnd) continue;
      daily[at.getDate() - 1] += toBase(Number(t.amount), t.currency);
    }
    const spentSoFar = daily.slice(0, now.getDate()).reduce((a, b) => a + b, 0);

    return {
      daily,
      dayOfMonth: now.getDate(),
      daysInMonth,
      avg: spentSoFar / now.getDate(),
      money,
      saved,
      owed,
      total: money + saved,
      obligations,
      upcoming,
      daysLeft,
      spentToday,
      perDay: free / Math.max(daysLeft, 1),
      short: free < 0,
    };
  }, [wallets, categories, transactions, balanceOf, toBase]);

  const overspent = data.spentToday > data.perDay && data.perDay > 0;

  return (
    <>
      {/* Шапка: светлая — переливающийся градиент «Аврора», тёмная —
          матовое стекло «Ночь» (globals.css, .money-hero). */}
      <button
        onClick={() => setExplain(true)}
        className="money-hero mb-3 w-full rounded-[1.75rem] px-5 pb-4 pt-4 text-left transition-transform duration-100 active:scale-[0.99]"
      >
        <span className="money-hero-blob a" aria-hidden />
        <span className="money-hero-blob b" aria-hidden />

        <p className="text-[0.8125rem] font-medium" style={{ color: "var(--muted)" }}>
          {data.short ? "Не хватает на обязательные платежи" : "Можно тратить сегодня"}
        </p>
        <p
          className={`money-big text-[2.625rem] font-extrabold leading-[1.1] tracking-tight tabular-nums ${data.short ? "short" : ""}`}
          style={{ color: data.short ? "var(--danger)" : undefined }}
        >
          <AnimatedMoney value={data.short ? data.obligations - data.money : data.perDay} currency={base} />
        </p>
        {/* Сколько месяца прошло — полоской, остаток дней — словами. */}
        <div className="mt-2 flex items-center gap-2.5 text-[0.75rem]" style={{ color: "var(--muted)" }}>
          <span className="shrink-0">
            осталось {data.daysLeft} {plural(data.daysLeft, "день", "дня", "дней")}
          </span>
          <span className="money-days flex-1">
            <span style={{ width: `${Math.round((data.dayOfMonth / data.daysInMonth) * 100)}%` }} />
          </span>
          {data.spentToday > 0 ? (
            <span className="shrink-0 tabular-nums">
              {"сегодня "}
              <span style={{ color: overspent ? "var(--danger)" : "var(--text)", fontWeight: 600 }}>
                {formatMoney(data.spentToday, base)}
              </span>
            </span>
          ) : null}
        </div>

        {/* Свободно и всего — стеклянная плашка под главной цифрой. */}
        <div
          className="mt-3.5 grid grid-cols-2 gap-3 rounded-2xl px-3.5 py-2.5"
          style={{ background: "color-mix(in srgb, #fff 9%, transparent)", border: "1px solid var(--border)" }}
        >
          <div className="min-w-0">
            <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              Свободно
            </p>
            <p className="truncate text-[1.1875rem] font-bold leading-tight tabular-nums">
              <AnimatedMoney value={data.money} currency={base} />
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              Всего
            </p>
            <p className="truncate text-[1.1875rem] font-bold leading-tight tabular-nums">{formatMoney(data.total, base)}</p>
          </div>
          {data.saved > 0 || data.owed > 0 ? (
            // Отложенное и долги — отдельной строкой: вместе с суммами они не
            // помещаются, а перенос посреди числа читается плохо.
            <p className="col-span-2 -mt-1.5 text-[0.6875rem] leading-snug tabular-nums" style={{ color: "var(--muted)" }}>
              {data.saved > 0 ? `отложено ${formatMoney(data.saved, base)}` : ""}
              {data.saved > 0 && data.owed > 0 ? " · " : ""}
              {data.owed > 0 ? `долгов и кредитов на ${formatMoney(data.owed, base)}` : ""}
            </p>
          ) : null}
        </div>

        <SpendSpark daily={data.daily} today={data.dayOfMonth} limit={data.short ? 0 : data.perDay} avg={data.avg} base={base} />
        <RatesLine
          base={base}
          rates={rates}
          auto={profile?.rates_auto !== false}
          shown={profile?.shown_rates ?? DEFAULT_SHOWN}
        />
      </button>

      <Sheet open={explain} title="Откуда эти числа" onClose={() => setExplain(false)}>
        <div className="space-y-2 pb-3 text-sm">
          <Row label="В кошельках и на картах" value={formatMoney(data.money, base)} />
          {data.saved > 0 ? (
            <Row label="Отложено в накоплениях" value={formatMoney(data.saved, base)} muted />
          ) : null}
          {data.saved > 0 ? (
            <div className="!mt-2.5 border-t pt-2.5" style={{ borderColor: "var(--border)" }}>
              <Row label="Всего денег" value={formatMoney(data.total, base)} strong />
            </div>
          ) : null}
          <p className="!mt-3 text-xs" style={{ color: "var(--muted)" }}>
            На день считаем только от свободных денег — накопления для того и
            отложены, чтобы их не тратить.
          </p>
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
          Обязательные — это регулярные платежи по категориям (в той части,
          что ещё не оплачена), кредиты с ежемесячным платежом, чьё число ещё
          не прошло, и долги со сроком погашения внутри остатка месяца.
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

/**
 * Мини-график под «Можно тратить сегодня»: столбик на каждый день месяца.
 * Пунктир — сколько можно в день; столбики выше него — красные, ниже —
 * серые: перерасход видно, не читая цифр. Будущие дни — точками.
 */
function SpendSpark({
  daily,
  today,
  limit,
  avg,
  base,
}: {
  daily: number[];
  today: number;
  limit: number;
  avg: number;
  base: string;
}) {
  if (!daily.some((v) => v > 0)) return null;
  const H = 30;
  const step = 6;
  const max = Math.max(limit, ...daily) || 1;
  const y = (v: number) => H - Math.max(2, (v / max) * H);
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        <span>Траты по дням</span>
        <span className="tabular-nums">в среднем {formatMoney(Math.round(avg), base as CurrencyCode)} в день</span>
      </div>
      <svg
        viewBox={`0 0 ${daily.length * step} ${H}`}
        preserveAspectRatio="none"
        className="block h-[30px] w-full"
        aria-label={`Траты по дням месяца, в среднем ${formatMoney(Math.round(avg), base as CurrencyCode)} в день`}
      >
        {daily.map((v, i) => {
          const day = i + 1;
          if (day > today) {
            return <rect key={i} x={i * step + 1} y={H - 2} width={4} height={2} rx={1} fill="var(--border)" />;
          }
          const over = limit > 0 && v > limit;
          return (
            <rect
              key={i}
              x={i * step + 1}
              y={y(v)}
              width={4}
              height={H - y(v)}
              rx={1.5}
              fill={v === 0 ? "var(--border)" : over ? `var(--spark-over, ${SERIES.expense.color})` : "var(--spark, var(--muted))"}
              opacity={day === today || over ? 1 : 0.55}
            />
          );
        })}
        {limit > 0 ? (
          <line
            x1={0}
            x2={daily.length * step}
            y1={y(limit)}
            y2={y(limit)}
            stroke="var(--text)"
            strokeOpacity={0.35}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
            strokeWidth={1}
          />
        ) : null}
      </svg>
      {limit > 0 ? (
        <p className="mt-0.5 text-[0.625rem]" style={{ color: "var(--muted)" }}>
          пунктир — сколько можно в день, красные дни — выше него
        </p>
      ) : null}
    </div>
  );
}

/**
 * Тихая строка курса внизу карточки: «$ 453,93 ₸ · ₽ 5,35 ₸». Какие
 * валюты — выбирают в настройках (до трёх). Курс — не деньги человека,
 * поэтому «глазок» его не прячет.
 */
function RatesLine({
  base,
  rates,
  auto,
  shown,
}: {
  base: CurrencyCode;
  rates: { code: CurrencyCode; rate_to_base: number }[];
  auto: boolean;
  shown: string[];
}) {
  const official = useOfficialRates();
  const items = shown
    .filter((code) => code !== base)
    .map((code) => {
      // Свой курс — только если автообновление выключено и он вообще задан.
      const own = !auto ? rates.find((r) => r.code === code)?.rate_to_base : undefined;
      const value = own ?? (official ? crossRate(official, code, base) : null);
      return { code, value: value != null ? value * perFor(code) : null };
    })
    .filter((x): x is { code: string; value: number } => !!x.value);
  if (items.length === 0) return null;
  return (
    <div
      className="mt-2.5 flex items-center justify-between gap-2 border-t pt-2 text-[0.6875rem] tabular-nums"
      style={{ borderColor: "var(--border)", color: "var(--muted)" }}
    >
      <span className="min-w-0 truncate">
        {items.map(({ code, value }, i) => (
          <span key={code}>
            {i > 0 ? " · " : ""}
            {labelFor(code)} <span style={{ color: "var(--text)" }}>{formatRate(value)}</span> {symbolOf(base)}
          </span>
        ))}
      </span>
      <span className="shrink-0">{auto ? "курс Нацбанка" : "ваш курс"}</span>
    </div>
  );
}
