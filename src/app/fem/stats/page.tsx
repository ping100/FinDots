"use client";

import { useMemo } from "react";
import { today } from "@/lib/tasks/dates";
import {
  FEM_COLOR,
  MOODS,
  SYMPTOMS,
  averageCycle,
  averagePeriod,
  cycleHealth,
  cycleLengths,
  daysBetween,
  tempShift,
} from "@/lib/fem/cycle";
import { addDays } from "@/lib/tasks/dates";
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
  const health = cycleHealth(periods);

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
        <p className="fem-card mt-3 rounded-2xl px-4 py-3 text-[0.8125rem] leading-snug">
          {spread <= 7
            ? `Цикл регулярный: последние циклы отличаются не больше чем на ${spread} ${plural(spread, "день", "дня", "дней")}.`
            : `Цикл скачет: от ${Math.min(...lengths)} до ${Math.max(...lengths)} дней. Если так держится несколько месяцев, стоит рассказать об этом врачу.`}
        </p>
      ) : null}

      {health ? (
        <div className="fem-card mt-3 rounded-3xl p-4">
          <p className="text-[0.9375rem] font-semibold">Сверка с нормой</p>
          <p className="mb-2.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            По критериям FIGO — международной федерации гинекологов
          </p>
          <div className="space-y-2">
            {health.map((h) => (
              <div key={h.label} className="flex items-start gap-2.5">
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-bold text-white"
                  style={{ background: h.ok ? "#14b8a6" : "#f59e0b" }}
                >
                  {h.ok ? "✓" : "!"}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{h.label}</span>
                  <span className="block text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
                    {h.detail}
                  </span>
                </span>
              </div>
            ))}
          </div>
          {health.some((h) => !h.ok) ? (
            <p className="mt-3 rounded-2xl px-3 py-2 text-[0.75rem] leading-snug" style={{ background: "var(--surface-2)" }}>
              Отклонение повторяется — это не диагноз, но стоит показать врачу-гинекологу. Возьмите с собой эти итоги.
            </p>
          ) : null}
        </div>
      ) : null}

      <TempChart />

      <div className="fem-card mt-3 rounded-3xl p-4">
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

      <div className="fem-card mt-3 rounded-3xl p-4">
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

/**
 * Базальная температура за текущий цикл: точки по дням, пунктир — уровень
 * до скачка, бирюзовая метка — найденная по скачку овуляция.
 */
function TempChart() {
  const { days, periods } = useFem();
  const now = today();
  const last = [...periods].map((p) => p.start_date).filter((d) => d <= now).sort().pop();
  const from = last && daysBetween(last, now) <= 45 ? last : addDays(now, -34);
  const temps = [...days.values()]
    .filter((d) => d.temp != null && d.day >= from && d.day <= now)
    .map((d) => ({ day: d.day, temp: Number(d.temp) }))
    .sort((a, b) => a.day.localeCompare(b.day));
  if (temps.length < 3) return null;
  const ov = tempShift(temps, from, addDays(now, 1));
  const W = 320;
  const H = 120;
  const total = Math.max(daysBetween(from, now), 14);
  const lo = Math.min(...temps.map((t) => t.temp)) - 0.1;
  const hi = Math.max(...temps.map((t) => t.temp)) + 0.1;
  const x = (d: string) => 8 + (daysBetween(from, d) / total) * (W - 16);
  const y = (t: number) => 8 + (1 - (t - lo) / (hi - lo)) * (H - 16);
  const before = ov ? temps.filter((t) => t.day <= ov).slice(-6) : [];
  const cover = before.length ? Math.max(...before.map((t) => t.temp)) : null;
  return (
    <div className="fem-card mt-3 rounded-3xl p-4">
      <p className="text-[0.9375rem] font-semibold">Базальная температура</p>
      <p className="mb-2 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        {ov ? `Скачок найден — овуляция ~${short(ov)}` : "Скачок после овуляции ещё не виден"}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}>
        {cover != null ? (
          <line x1={8} x2={W - 8} y1={y(cover)} y2={y(cover)} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />
        ) : null}
        {ov ? <line x1={x(ov)} x2={x(ov)} y1={4} y2={H - 4} stroke="#14b8a6" strokeWidth={2} strokeDasharray="2 3" /> : null}
        <polyline
          fill="none"
          stroke={FEM_COLOR}
          strokeWidth={2}
          strokeLinejoin="round"
          points={temps.map((t) => `${x(t.day)},${y(t.temp)}`).join(" ")}
        />
        {temps.map((t) => (
          <circle key={t.day} cx={x(t.day)} cy={y(t.temp)} r={4} fill="var(--surface)" stroke={FEM_COLOR} strokeWidth={2} />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[0.625rem] tabular-nums" style={{ color: "var(--muted)" }}>
        <span>{short(from)}</span>
        <span>
          {lo.toFixed(1)}–{hi.toFixed(1)}°
        </span>
        <span>{short(now)}</span>
      </div>
    </div>
  );
}

function Tile({ value, unit, label }: { value: string; unit: string; label: string }) {
  return (
    <div className="fem-card rounded-2xl px-3 py-3 text-center">
      <span className="block text-[1.375rem] font-bold leading-tight tabular-nums">{value}</span>
      <span className="block text-[0.6875rem]">{unit}</span>
      <span className="block text-[0.625rem]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
    </div>
  );
}
