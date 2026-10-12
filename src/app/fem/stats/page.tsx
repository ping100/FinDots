"use client";

import { useMemo } from "react";
import { today } from "@/lib/tasks/dates";
import { FEM_COLOR, MOODS, SYMPTOMS, averageCycle, averagePeriod, cycleLengths, daysBetween } from "@/lib/fem/cycle";
import { short } from "@/lib/fem/format";
import { useFem } from "@/components/fem/DataProvider";
import { FemHeader } from "@/components/fem/Shell";
import { plural } from "@/components/fem/parts";
import { Logo } from "@/components/Logo";

/**
 * Итоги: средний цикл и месячные, длина каждого цикла столбиком и что
 * чаще всего отмечалось в самочувствии за последние три месяца.
 */
export default function FemStats() {
  const { settings, periods, days } = useFem();
  const now = today();

  const data = useMemo(() => {
    const sorted = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const cycles: { start: string; length: number }[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const length = daysBetween(sorted[i - 1].start_date, sorted[i].start_date);
      if (length >= 15 && length <= 60) cycles.push({ start: sorted[i - 1].start_date, length });
    }
    const counts = new Map<string, number>();
    for (const [day, entry] of days) {
      if (daysBetween(day, now) > 92) continue;
      for (const s of entry.symptoms) counts.set(s, (counts.get(s) ?? 0) + 1);
      if (entry.mood) counts.set(`mood:${entry.mood}`, (counts.get(`mood:${entry.mood}`) ?? 0) + 1);
    }
    const top = [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, n]) => {
        const s = key.startsWith("mood:") ? MOODS.find((m) => `mood:${m.value}` === key) : SYMPTOMS.find((x) => x.value === key);
        return { key, n, label: s?.label ?? key, emoji: s?.emoji ?? "" };
      });
    return { cycles: cycles.slice(-8), top };
  }, [periods, days, now]);

  const avgCycle = averageCycle(periods, settings!.cycle_length);
  const avgPeriod = averagePeriod(periods, settings!.period_length);
  const lengths = cycleLengths(periods).slice(-6);
  const spread = lengths.length >= 3 ? Math.max(...lengths) - Math.min(...lengths) : null;

  if (periods.length === 0) {
    return (
      <div className="mx-auto w-full max-w-md px-4 pb-32">
        <FemHeader title="Итоги" />
        <div className="flex flex-col items-center py-12 text-center">
          <span style={{ opacity: 0.55 }}>
            <Logo size={52} animated />
          </span>
          <p className="mt-4 text-[0.9375rem] font-semibold">Пока нечего считать</p>
          <p className="mt-1 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            Отмечайте начало месячных — после двух циклов здесь появятся итоги
          </p>
        </div>
      </div>
    );
  }

  const max = Math.max(avgCycle, ...data.cycles.map((c) => c.length));
  const H = 120;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <FemHeader title="Итоги" sub="По вашим отметкам" />

      <div className="grid grid-cols-3 gap-2">
        <Tile value={`${avgCycle}`} unit={plural(avgCycle, "день", "дня", "дней")} label="средний цикл" />
        <Tile value={`${avgPeriod}`} unit={plural(avgPeriod, "день", "дня", "дней")} label="месячные" />
        <Tile value={`${data.cycles.length}`} unit={plural(data.cycles.length, "цикл", "цикла", "циклов")} label="отмечено" />
      </div>

      {spread != null ? (
        <p className="mt-3 rounded-2xl px-4 py-3 text-[0.8125rem] leading-snug" style={{ background: "var(--surface)" }}>
          {spread <= 7
            ? `Цикл регулярный: последние циклы отличаются не больше чем на ${spread} ${plural(spread, "день", "дня", "дней")}.`
            : `Цикл скачет: от ${Math.min(...lengths)} до ${Math.max(...lengths)} дней. Если так держится несколько месяцев, стоит рассказать об этом врачу.`}
        </p>
      ) : null}

      <div className="mt-3 rounded-3xl p-4" style={{ background: "var(--surface)" }}>
        <p className="text-[0.9375rem] font-semibold">Длина циклов</p>
        <p className="mb-3 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          Каждый столбик — один цикл, пунктир — средний ({avgCycle} {plural(avgCycle, "день", "дня", "дней")})
        </p>
        {data.cycles.length === 0 ? (
          <p className="py-4 text-center text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            Появится, когда будет отмечено начало хотя бы двух месячных
          </p>
        ) : (
          <div className="relative" style={{ height: H + 34 }}>
            <div
              className="absolute inset-x-0 border-t border-dashed"
              style={{ top: 16 + H - (avgCycle / max) * H, borderColor: "var(--muted)", opacity: 0.6 }}
            />
            <div className="absolute inset-0 flex items-end justify-around gap-1.5">
              {data.cycles.map((c) => (
                <div key={c.start} className="flex min-w-0 flex-1 flex-col items-center">
                  <span className="mb-1 text-[0.6875rem] font-semibold tabular-nums">{c.length}</span>
                  <span
                    className="animate-grow-y w-full max-w-[28px] rounded-t-[4px]"
                    style={{ height: (c.length / max) * H, background: FEM_COLOR, transformOrigin: "bottom" }}
                  />
                  <span className="mt-1 h-4 truncate text-[0.625rem]" style={{ color: "var(--muted)" }}>
                    {short(c.start)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 rounded-3xl p-4" style={{ background: "var(--surface)" }}>
        <p className="text-[0.9375rem] font-semibold">Чаще всего за 3 месяца</p>
        {data.top.length === 0 ? (
          <p className="mt-2 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            Отмечайте самочувствие на главном экране — здесь появится, что беспокоит чаще
          </p>
        ) : (
          <div className="mt-2.5 space-y-2">
            {data.top.map((t) => (
              <div key={t.key} className="flex items-center gap-2.5 text-sm">
                <span className="w-5 text-center">{t.emoji}</span>
                <span className="w-32 shrink-0 truncate">{t.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                  <span
                    className="animate-grow-x block h-full rounded-full"
                    style={{ width: `${(t.n / data.top[0].n) * 100}%`, background: FEM_COLOR }}
                  />
                </span>
                <span className="w-7 text-right text-[0.75rem] tabular-nums" style={{ color: "var(--muted)" }}>
                  {t.n}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div className="rounded-2xl px-3 py-3 text-center" style={{ background: "var(--surface)" }}>
      <span className="block text-[1.375rem] font-bold leading-tight tabular-nums">{value}</span>
      <span className="block text-[0.6875rem]">{unit}</span>
      <span className="block text-[0.625rem]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
    </div>
  );
}
