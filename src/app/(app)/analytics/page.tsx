"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/lib/icons";
import { formatMoney, monthLabel, monthRange } from "@/lib/money";
import { buildBuckets, type Grouping } from "@/lib/report";
import type { CategoryKind } from "@/lib/types";
import { useStore } from "@/components/DataProvider";
import { IncomeExpenseChart, NetChart, SERIES, ShareBar } from "@/components/charts";
import { Button } from "@/components/ui";

type Mode = "expenses" | "both" | "net";

const MODES: { id: Mode; label: string }[] = [
  { id: "expenses", label: "Расходы" },
  { id: "both", label: "Доходы и расходы" },
  { id: "net", label: "Доходы − Расходы" },
];

const GROUPINGS: { id: Grouping; label: string }[] = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
];

export default function AnalyticsPage() {
  const { transactions, categories, profile, aiKeyHint, toBase } = useStore();
  const [mode, setMode] = useState<Mode>("expenses");
  const [grouping, setGrouping] = useState<Grouping>("day");
  const [offset, setOffset] = useState(0);
  const [side, setSide] = useState<CategoryKind>("expense");
  const [tableOpen, setTableOpen] = useState(false);
  const base = profile?.base_currency ?? "KZT";

  const [advice, setAdvice] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const buckets = useMemo(
    () => buildBuckets(transactions, offset, grouping, toBase),
    [transactions, offset, grouping, toBase],
  );

  const stats = useMemo(() => {
    const collect = (shift: number) => {
      const { from, to } = monthRange(shift);
      const income = new Map<string, number>();
      const expense = new Map<string, number>();
      for (const t of transactions) {
        const at = new Date(t.occurred_at);
        if (at < from || at >= to) continue;
        const value = toBase(Number(t.amount), t.currency);
        if (t.type === "income" && t.category_id) {
          income.set(t.category_id, (income.get(t.category_id) ?? 0) + value);
        }
        if (t.type === "expense" && t.category_id) {
          expense.set(t.category_id, (expense.get(t.category_id) ?? 0) + value);
        }
      }
      return { income, expense };
    };

    const current = collect(offset);
    const previous = collect(offset - 1);
    const listSide = mode === "expenses" ? "expense" : side;
    const pick = (data: ReturnType<typeof collect>) =>
      listSide === "income" ? data.income : data.expense;

    const rows = categories
      .filter((c) => c.kind === listSide)
      .map((c) => ({
        category: c,
        now: pick(current).get(c.id) ?? 0,
        before: pick(previous).get(c.id) ?? 0,
      }))
      .filter((r) => r.now > 0 || r.before > 0)
      .sort((a, b) => b.now - a.now);

    const total = (map: Map<string, number>) => [...map.values()].reduce((a, b) => a + b, 0);
    return {
      rows,
      peak: Math.max(1, ...rows.map((r) => Math.max(r.now, r.before))),
      incomeTotal: total(current.income),
      expenseTotal: total(current.expense),
      prevExpenseTotal: total(previous.expense),
    };
  }, [transactions, categories, offset, side, mode, toBase]);

  const runAnalysis = async () => {
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch("/api/analyze", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не получилось");
      setAdvice(data.text as string);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Не получилось");
    } finally {
      setAiBusy(false);
    }
  };

  const diff = stats.expenseTotal - stats.prevExpenseTotal;
  const share =
    stats.prevExpenseTotal > 0 ? Math.round((diff / stats.prevExpenseTotal) * 100) : null;

  const shareItems = stats.rows
    .filter((r) => r.now > 0)
    .map((r) => ({ id: r.category.id, name: r.category.name, color: r.category.color, value: r.now }));

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <h1 className="py-2 text-[26px] font-bold">Отчет</h1>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {MODES.map((item) => (
          <button
            key={item.id}
            onClick={() => setMode(item.id)}
            className="shrink-0 rounded-full border px-4 py-2 text-sm font-medium"
            style={{
              background: mode === item.id ? "var(--surface)" : "transparent",
              borderColor: mode === item.id ? "var(--accent)" : "var(--border)",
              color: mode === item.id ? "var(--accent)" : "inherit",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => setOffset((o) => o - 1)} aria-label="Раньше" style={{ color: "var(--accent)" }}>
          <Icon name="chevron-left" size={22} />
        </button>
        <span
          className="rounded-full px-4 py-1.5 text-sm font-semibold first-letter:uppercase"
          style={{ background: "var(--surface-2)" }}
        >
          {monthLabel(offset, true)}
        </span>
        <button
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          disabled={offset >= 0}
          aria-label="Позже"
          className="disabled:opacity-25"
          style={{ color: "var(--accent)" }}
        >
          <Icon name="chevron-right" size={22} />
        </button>
      </div>

      <div className="mb-4 rounded-2xl p-3" style={{ background: "var(--surface)" }}>
        {mode === "expenses" ? (
          <>
            <ShareBar items={shareItems} total={stats.expenseTotal} currency={base} />
          </>
        ) : (
          <>
            <div className="mb-2 flex rounded-xl p-1" style={{ background: "var(--surface-2)" }}>
              {GROUPINGS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setGrouping(item.id)}
                  className="flex-1 rounded-lg py-1.5 text-[13px] font-medium"
                  style={{
                    background: grouping === item.id ? "var(--surface)" : "transparent",
                    boxShadow: grouping === item.id ? "0 1px 3px rgba(0,0,0,0.12)" : undefined,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {mode === "both" ? (
              <IncomeExpenseChart buckets={buckets} currency={base} />
            ) : (
              <NetChart buckets={buckets} currency={base} />
            )}
            {grouping === "month" ? (
              <p className="mt-1 text-center text-[11px]" style={{ color: "var(--muted)" }}>
                12 месяцев по выбранный включительно
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="mb-4 grid grid-cols-3 rounded-2xl py-3" style={{ background: "var(--surface)" }}>
        <Stat label="Доходы" value={formatMoney(stats.incomeTotal, base)} color={SERIES.income.color} />
        <Stat label="Расходы" value={formatMoney(stats.expenseTotal, base)} color={SERIES.expense.color} />
        <Stat
          label="Итого"
          value={formatMoney(stats.incomeTotal - stats.expenseTotal, base)}
          hint={share != null ? `${diff > 0 ? "+" : ""}${share}% к прошлому` : undefined}
        />
      </div>

      {mode === "net" ? (
        <div className="mb-6">
          <button
            onClick={() => setTableOpen((open) => !open)}
            className="mb-2 flex w-full items-center gap-2 text-sm font-semibold"
          >
            <Icon name={tableOpen ? "chevron-down" : "chevron-right"} size={15} />
            Таблица по периодам
          </button>
          {tableOpen ? (
            <div className="overflow-hidden rounded-2xl" style={{ background: "var(--surface)" }}>
              {buckets
                .filter((b) => b.income || b.expense)
                .map((b, i) => (
                  <div
                    key={b.key}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm"
                    style={{ borderTop: i ? "1px solid var(--border)" : undefined }}
                  >
                    <span className="flex-1 truncate">{b.full}</span>
                    <span className="tabular-nums" style={{ color: "var(--muted)" }}>
                      {formatMoney(b.income, base)} / {formatMoney(b.expense, base)}
                    </span>
                    <span
                      className="w-24 text-right font-semibold tabular-nums"
                      style={{
                        color: b.income - b.expense < 0 ? SERIES.expense.color : SERIES.income.color,
                      }}
                    >
                      {formatMoney(b.income - b.expense, base)}
                    </span>
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {mode === "both" ? (
            <div className="mb-4 flex rounded-2xl p-1" style={{ background: "var(--surface-2)" }}>
              {(["income", "expense"] as CategoryKind[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setSide(value)}
                  className="flex-1 rounded-xl py-2 text-sm font-medium"
                  style={{
                    background: side === value ? "var(--surface)" : "transparent",
                    boxShadow: side === value ? "0 1px 3px rgba(0,0,0,0.12)" : undefined,
                  }}
                >
                  {value === "income" ? "Доходы" : "Расходы"}
                </button>
              ))}
            </div>
          ) : null}

          {stats.rows.length === 0 ? (
            <p className="mb-6 py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
              За этот период данных нет
            </p>
          ) : (
            <div className="mb-6 space-y-3.5">
              {stats.rows.map(({ category, now, before }) => {
                const limit = category.kind === "expense" ? category.monthly_limit : null;
                const overLimit = limit != null && now > limit;
                return (
                  <div key={category.id}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-full text-white"
                          style={{ background: category.color }}
                        >
                          <Icon name={category.icon} size={13} />
                        </span>
                        {category.name}
                      </span>
                      <span className="tabular-nums">
                        {formatMoney(now, base)}
                        {before > 0 ? (
                          <span
                            className="ml-1 text-[11px]"
                            style={{ color: now > before ? SERIES.expense.color : SERIES.income.color }}
                          >
                            {now > before ? "↑" : "↓"}
                            {changeLabel(now, before)}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <span
                      className="block h-1.5 w-full overflow-hidden rounded-full"
                      style={{ background: "var(--surface-2)" }}
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(now / stats.peak) * 100}%`,
                          background: overLimit ? SERIES.expense.color : category.color,
                        }}
                      />
                    </span>
                    <span
                      className="mt-0.5 block h-1 w-full overflow-hidden rounded-full opacity-40"
                      style={{ background: "var(--surface-2)" }}
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${(before / stats.peak) * 100}%`, background: "var(--muted)" }}
                      />
                    </span>
                    {limit != null ? (
                      <span
                        className="mt-1 block text-[11px]"
                        style={{ color: overLimit ? SERIES.expense.color : "var(--muted)" }}
                      >
                        лимит {formatMoney(limit, base)}
                        {overLimit ? ` · перерасход ${formatMoney(now - limit, base)}` : ""}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <h2 className="mb-1 text-[15px] font-semibold">Разбор бюджета</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
        Модель получает только суммы по категориям, балансы и долги — без
        комментариев к операциям.
      </p>
      {aiKeyHint ? (
        <Button onClick={runAnalysis} disabled={aiBusy}>
          {aiBusy ? "Думает…" : advice ? "Пересчитать" : "Разобрать мой бюджет"}
        </Button>
      ) : (
        // Без ключа кнопка только выдала бы ошибку — ведём сразу туда, где его заводят.
        <Link href="/settings">
          <Button variant="ghost">Добавить ключ OpenRouter в настройках</Button>
        </Link>
      )}

      {aiError ? (
        <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
          {aiError}
        </p>
      ) : null}

      {advice ? (
        <div
          className="selectable animate-fade mt-3 whitespace-pre-wrap rounded-2xl p-4 text-sm leading-relaxed"
          style={{ background: "var(--surface)" }}
        >
          {advice}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Рост от крошечной базы даёт числа вроде «↑2088%» — они ничего не сообщают
 * и забивают строку. Выше пяти крат показываем сам факт, а не цифру.
 */
function changeLabel(now: number, before: number): string {
  const percent = Math.abs(Math.round(((now - before) / before) * 100));
  return percent > 500 ? ">500%" : `${percent}%`;
}

function Stat({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color?: string;
  hint?: string;
}) {
  return (
    <div className="px-2 text-center">
      <p className="text-[11px]" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <p className="text-[15px] font-bold tabular-nums" style={{ color }}>
        {value}
      </p>
      {hint ? (
        <p className="text-[10px]" style={{ color: "var(--muted)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
