"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import { formatMoney, monthLabel, monthRange } from "@/lib/money";
import { useStore } from "@/components/DataProvider";
import { Button } from "@/components/ui";

export default function AnalyticsPage() {
  const { transactions, categories, profile, toBase } = useStore();
  const [offset, setOffset] = useState(0);
  const base = profile?.base_currency ?? "KZT";

  const [advice, setAdvice] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const sum = (shift: number) => {
      const { from, to } = monthRange(shift);
      const perCategory = new Map<string, number>();
      let income = 0;
      for (const t of transactions) {
        const at = new Date(t.occurred_at);
        if (at < from || at >= to) continue;
        const value = toBase(Number(t.amount), t.currency);
        if (t.type === "expense" && t.category_id) {
          perCategory.set(t.category_id, (perCategory.get(t.category_id) ?? 0) + value);
        }
        if (t.type === "income") income += value;
      }
      return { perCategory, income };
    };

    const current = sum(offset);
    const previous = sum(offset - 1);
    const rows = categories
      .filter((c) => c.kind === "expense")
      .map((c) => ({
        category: c,
        now: current.perCategory.get(c.id) ?? 0,
        before: previous.perCategory.get(c.id) ?? 0,
      }))
      .filter((r) => r.now > 0 || r.before > 0)
      .sort((a, b) => b.now - a.now);

    const total = rows.reduce((acc, r) => acc + r.now, 0);
    const totalBefore = rows.reduce((acc, r) => acc + r.before, 0);
    const peak = Math.max(1, ...rows.map((r) => Math.max(r.now, r.before)));

    return { rows, total, totalBefore, peak, income: current.income };
  }, [transactions, categories, offset, toBase]);

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

  const diff = stats.total - stats.totalBefore;
  const share = stats.totalBefore > 0 ? Math.round((diff / stats.totalBefore) * 100) : null;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-28 pt-3">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => setOffset((o) => o - 1)} className="p-2" aria-label="Предыдущий месяц">
          <Icon name="plus" size={18} className="rotate-[135deg]" />
        </button>
        <h1 className="text-base font-semibold capitalize">{monthLabel(offset)}</h1>
        <button
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          className="p-2 disabled:opacity-30"
          disabled={offset >= 0}
          aria-label="Следующий месяц"
        >
          <Icon name="plus" size={18} className="-rotate-45" />
        </button>
      </div>

      <div
        className="mb-4 grid grid-cols-2 gap-3 rounded-3xl p-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Потрачено
          </p>
          <p className="text-xl font-bold tabular-nums">{formatMoney(stats.total, base)}</p>
          {share != null ? (
            <p
              className="text-xs"
              style={{ color: diff > 0 ? "var(--danger)" : "var(--ok)" }}
            >
              {diff > 0 ? "+" : ""}
              {share}% к прошлому месяцу
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Доход
          </p>
          <p className="text-xl font-bold tabular-nums">{formatMoney(stats.income, base)}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            остаток {formatMoney(stats.income - stats.total, base)}
          </p>
        </div>
      </div>

      <h2 className="mb-2 text-sm font-semibold">По категориям</h2>
      {stats.rows.length === 0 ? (
        <p className="mb-6 text-xs" style={{ color: "var(--muted)" }}>
          За этот месяц трат нет
        </p>
      ) : (
        <div className="mb-6 space-y-3">
          {stats.rows.map(({ category, now, before }) => {
            const limit = category.monthly_limit;
            const overLimit = limit != null && now > limit;
            return (
              <div key={category.id}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span style={{ color: category.color }}>
                      <Icon name={category.icon} size={15} />
                    </span>
                    {category.name}
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(now, base)}
                    {before > 0 ? (
                      <span
                        className="ml-1 text-[11px]"
                        style={{ color: now > before ? "var(--danger)" : "var(--ok)" }}
                      >
                        {now > before ? "↑" : "↓"}
                        {Math.abs(Math.round(((now - before) / before) * 100))}%
                      </span>
                    ) : null}
                  </span>
                </div>
                {/* верхняя полоса — этот месяц, нижняя бледная — прошлый */}
                <span className="block h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(now / stats.peak) * 100}%`,
                      background: overLimit ? "var(--danger)" : category.color,
                    }}
                  />
                </span>
                <span className="mt-0.5 block h-1 w-full overflow-hidden rounded-full opacity-40" style={{ background: "var(--surface-2)" }}>
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(before / stats.peak) * 100}%`, background: "var(--muted)" }}
                  />
                </span>
                {limit != null ? (
                  <span className="mt-1 block text-[11px]" style={{ color: overLimit ? "var(--danger)" : "var(--muted)" }}>
                    лимит {formatMoney(limit, base)}
                    {overLimit ? ` · перерасход ${formatMoney(now - limit, base)}` : ""}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold">Разбор бюджета</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
        Модель получает только суммы по категориям, балансы и долги — без
        комментариев к операциям.
      </p>
      <Button onClick={runAnalysis} disabled={aiBusy}>
        {aiBusy ? "Думает…" : advice ? "Пересчитать" : "Разобрать мой бюджет"}
      </Button>

      {aiError ? (
        <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
          {aiError}
        </p>
      ) : null}

      {advice ? (
        <div
          className="mt-3 whitespace-pre-wrap rounded-2xl p-4 text-sm leading-relaxed"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {advice}
        </div>
      ) : null}
    </div>
  );
}
