"use client";

import { useMemo, useState } from "react";
import { useFood } from "@/components/food/DataProvider";
import { FoodHeader } from "@/components/food/Shell";
import { normFor, totals } from "@/lib/food/norms";
import { WEEKDAY_HEADS, addDays, dayNumber, shortDay, startOfWeek, today } from "@/lib/tasks/dates";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

/** Итоги: неделя столбиками против нормы, среднее, БЖУ и частые блюда. */
export default function FoodStats() {
  const { entries, settings } = useFood();
  const norm = normFor(settings);
  const [week, setWeek] = useState(startOfWeek(today()));
  const [picked, setPicked] = useState<string | null>(null);
  const now = today();

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const byDay = useMemo(() => {
    const m = new Map<string, ReturnType<typeof totals>>();
    for (const d of days) m.set(d, totals(entries.filter((e) => e.day === d)));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, week]);
  const logged = days.filter((d) => (byDay.get(d)?.kcal ?? 0) > 0);
  const avg = logged.length ? totals(logged.map((d) => byDay.get(d)!)) : null;
  const div = Math.max(logged.length, 1);
  const max = Math.max(norm?.kcal ?? 0, ...days.map((d) => byDay.get(d)?.kcal ?? 0), 1) * 1.1;

  // Что ешь чаще всего — за всю историю на телефоне.
  const top = useMemo(() => {
    const m = new Map<string, { name: string; n: number; kcal: number }>();
    for (const e of entries) {
      const k = e.name.toLowerCase();
      const cur = m.get(k) ?? { name: e.name, n: 0, kcal: 0 };
      m.set(k, { ...cur, n: cur.n + 1, kcal: cur.kcal + Number(e.kcal) });
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  }, [entries]);

  const sel = picked ? byDay.get(picked) : null;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <FoodHeader title="Итоги" sub="Yumdots" />

      <div className="food-card rounded-3xl p-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setWeek(addDays(week, -7))} className="rounded-full px-2 py-1 text-[0.8125rem]" style={{ color: "var(--accent)" }}>
            ‹ Раньше
          </button>
          <span className="text-[0.8125rem] font-semibold">
            {shortDay(week)} – {shortDay(addDays(week, 6))}
          </span>
          <button
            onClick={() => setWeek(addDays(week, 7))}
            disabled={addDays(week, 7) > now}
            className="rounded-full px-2 py-1 text-[0.8125rem] disabled:opacity-30"
            style={{ color: "var(--accent)" }}
          >
            Позже ›
          </button>
        </div>

        <div className="relative mt-3 h-40">
          {norm ? (
            <div className="absolute inset-x-0 border-t border-dashed" style={{ bottom: `${(norm.kcal / max) * 100}%`, borderColor: "var(--accent)" }}>
              <span className="absolute -top-4 right-0 text-[0.625rem] font-semibold" style={{ color: "var(--accent)" }}>
                норма {fmt(norm.kcal)}
              </span>
            </div>
          ) : null}
          <div className="absolute inset-0 grid grid-cols-7 items-end gap-2">
            {days.map((d) => {
              const kcal = byDay.get(d)?.kcal ?? 0;
              const over = norm && kcal > norm.kcal * 1.1;
              return (
                <button key={d} onClick={() => setPicked(picked === d ? null : d)} className="flex h-full flex-col justify-end" aria-label={`${shortDay(d)}: ${fmt(kcal)} ккал`}>
                  <span
                    className="w-full rounded-t-lg transition-all duration-500"
                    style={{
                      height: `${(kcal / max) * 100}%`,
                      minHeight: kcal ? 4 : 0,
                      background: over ? "#ef4444" : "linear-gradient(180deg, #fb923c, #f97316)",
                      opacity: picked && picked !== d ? 0.45 : 1,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-2 text-center text-[0.625rem]" style={{ color: "var(--muted)" }}>
          {days.map((d, i) => (
            <span key={d} className={d === now ? "font-bold" : ""} style={d === now ? { color: "var(--accent)" } : undefined}>
              {WEEKDAY_HEADS[i]} {dayNumber(d)}
            </span>
          ))}
        </div>
        {sel && picked ? (
          <p className="animate-lift mt-3 rounded-2xl px-3 py-2 text-center text-[0.8125rem] tabular-nums" style={{ background: "var(--surface-2)" }}>
            {shortDay(picked)}: <b>{fmt(sel.kcal)} ккал</b> · Б {Math.round(sel.protein)} · Ж {Math.round(sel.fat)} · У {Math.round(sel.carbs)}
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat title="В среднем за день" value={avg ? `${fmt(avg.kcal / div)} ккал` : "—"} hint={logged.length ? `по ${logged.length} дн. с записями` : "на этой неделе пусто"} />
        <Stat
          title="Дней в норме"
          value={norm ? `${logged.filter((d) => (byDay.get(d)?.kcal ?? 0) <= norm.kcal * 1.1).length} из ${logged.length}` : "—"}
          hint={norm ? "не больше нормы +10%" : "укажите норму в настройках"}
        />
      </div>

      {avg ? (
        <div className="food-card mt-3 rounded-3xl p-4">
          <p className="text-[0.9375rem] font-semibold">БЖУ в среднем</p>
          <div className="mt-2.5 space-y-2">
            {(
              [
                ["Белки", avg.protein / div, norm?.protein, "#ef4444"],
                ["Жиры", avg.fat / div, norm?.fat, "#eab308"],
                ["Углеводы", avg.carbs / div, norm?.carbs, "#22c55e"],
              ] as const
            ).map(([label, v, goal, color]) => (
              <div key={label} className="flex items-center gap-3 text-[0.8125rem]">
                <span className="w-20 shrink-0">{label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                  <span className="block h-full rounded-full" style={{ width: `${goal ? Math.min(100, (v / goal) * 100) : 60}%`, background: color }} />
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums" style={{ color: "var(--muted)" }}>
                  {Math.round(v)}
                  {goal ? ` / ${goal}` : ""} г
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {top.length ? (
        <div className="food-card mt-3 rounded-3xl p-4">
          <p className="text-[0.9375rem] font-semibold">Чаще всего</p>
          <ul className="mt-2 space-y-1.5">
            {top.map((t) => (
              <li key={t.name} className="flex items-center justify-between text-[0.8125rem]">
                <span className="truncate">{t.name}</span>
                <span className="shrink-0 tabular-nums" style={{ color: "var(--muted)" }}>
                  {t.n} раз · ~{fmt(t.kcal / t.n)} ккал
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="food-card rounded-3xl p-3.5">
      <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        {title}
      </p>
      <p className="mt-0.5 text-[1.125rem] font-bold tabular-nums">{value}</p>
      <p className="text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
        {hint}
      </p>
    </div>
  );
}
