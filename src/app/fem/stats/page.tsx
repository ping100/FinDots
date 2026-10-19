"use client";

import { useId, useMemo, useState } from "react";
import { MoodIcon, SymptomIcon } from "@/components/fem/FemIcons";
import { today } from "@/lib/tasks/dates";
import {
  FEM_COLOR,
  MOODS,
  SYMPTOMS,
  averageCycle,
  averagePeriod,
  daysBetween,
  pastPhase,
  tempShift,
  ACTIVITY,
  PHASE_COLOR,
  moodsOf,
  type Phase,
} from "@/lib/fem/cycle";
import { addDays } from "@/lib/tasks/dates";
import { CycleAssistant, CycleDynamics, CycleHistory, MyCycles } from "@/components/fem/CycleStats";
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
      for (const m of moodsOf(entry)) counts.set(`mood:${m}`, (counts.get(`mood:${m}`) ?? 0) + 1);
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
  // Разброс длины последних циклов (FIGO: до 7–9 дней — регулярный).
  const recent = data.cycles.slice(-6).map((c) => c.length);
  const spread = recent.length >= 2 ? Math.max(...recent) - Math.min(...recent) : null;

  if (periods.length === 0) {
    return (
      <div className="mx-auto w-full max-w-md px-4 pb-32">
        <FemHeader title="Итоги" />
        <div className="flex flex-col items-center py-12 text-center">
          <span style={{ opacity: 0.55 }}>
            <Logo size={52} animated focus="fem" />
          </span>
          <p className="mt-4 text-[0.9375rem] font-semibold">Пока нечего считать</p>
          <p className="mt-1 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            Отмечайте начало месячных — после двух циклов здесь появятся итоги
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <FemHeader title="Итоги" sub="По вашим отметкам" />

      <div className="grid grid-cols-3 gap-2">
        <Tile
          index={0}
          bg="linear-gradient(150deg, #f472b6, #a855f7)"
          label="Средний цикл"
          value={`${avgCycle}`}
          unit={plural(avgCycle, "день", "дня", "дней")}
        />
        <Tile
          index={1}
          bg="linear-gradient(150deg, #fb7185, #f97316)"
          label="Месячные"
          value={`${avgPeriod}`}
          unit={plural(avgPeriod, "день", "дня", "дней")}
        />
        <Tile
          index={2}
          bg="linear-gradient(150deg, #2dd4bf, #0284c7)"
          label="Регулярность"
          value={spread == null ? "—" : spread <= 9 ? "Ровный" : "Скачет"}
          unit={spread == null ? "нужно 3 цикла" : `разброс ${spread} ${plural(spread, "день", "дня", "дней")}`}
          small
        />
      </div>

      <MyCycles />
      <CycleAssistant />
      <CycleHistory />
      <CycleDynamics />

      <TempChart />
      <PhaseInsights />
      <WeightChart />
      <Lifestyle />

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
                {t.key.startsWith("mood:") ? <MoodIcon value={t.key.slice(5)} size={20} /> : <SymptomIcon value={t.key} size={20} />}
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
        {ov ? `Скачок найден — овуляция ~${short(ov)}` : "Скачок после овуляции ещё не виден"} · нажмите на график — покажу значение
      </p>
      <SmoothChart
        W={W}
        H={H}
        color={FEM_COLOR}
        format={(v) => `${v.toFixed(2).replace(".", ",")}°`}
        pts={temps.map((t) => ({ x: x(t.day), y: y(t.temp), day: t.day, value: t.temp }))}
      >
        {cover != null ? (
          <line x1={8} x2={W - 8} y1={y(cover)} y2={y(cover)} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth={1} opacity={0.6} />
        ) : null}
        {ov ? <line x1={x(ov)} x2={x(ov)} y1={4} y2={H - 4} stroke="#14b8a6" strokeWidth={2} strokeDasharray="2 3" /> : null}
      </SmoothChart>
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

/** Яркая плитка сверху — как карточки «Сегодня для вас»: перелив, блик, кружок Dots. */
function Tile({
  bg,
  label,
  value,
  unit,
  index,
  small,
}: {
  bg: string;
  label: string;
  value: string;
  unit: string;
  index: number;
  small?: boolean;
}) {
  return (
    <div
      className="animate-lift relative overflow-hidden rounded-2xl px-3 pb-3 pt-2.5 text-white"
      style={{
        background: bg,
        boxShadow: "0 12px 22px -14px rgba(124,58,237,0.65), inset 0 1px 0 rgba(255,255,255,0.35)",
        animationDelay: `${index * 70}ms`,
      }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.18), transparent)" }} />
      <span className="pointer-events-none absolute -bottom-6 -right-6 h-16 w-16 rounded-full bg-white/15" />
      <span className="relative block text-[0.625rem] font-medium opacity-90">{label}</span>
      <span className={`relative mt-1 block font-bold leading-tight tabular-nums ${small ? "text-[1.0625rem]" : "text-[1.625rem]"}`}>{value}</span>
      <span className="relative block text-[0.625rem] opacity-85">{unit}</span>
    </div>
  );
}

/** Плавная линия через точки (Катмулл — Ром → кривые Безье). */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/**
 * График-линия: плавная кривая, мягкая заливка под ней, точки. Нажатие —
 * ближайшая точка увеличивается и показывает значение и дату.
 */
function SmoothChart({
  pts,
  W,
  H,
  color,
  format,
  children,
}: {
  pts: { x: number; y: number; day: string; value: number }[];
  W: number;
  H: number;
  color: string;
  format: (v: number) => string;
  children?: React.ReactNode;
}) {
  const id = useId().replace(/:/g, "");
  const [sel, setSel] = useState<number | null>(null);
  const line = smoothPath(pts.map((p) => [p.x, p.y]));
  const area = `${line} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`;
  const p = sel != null ? pts[sel] : null;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full cursor-pointer"
      style={{ overflow: "visible", touchAction: "pan-y" }}
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - box.left) / box.width) * W;
        let best = 0;
        for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].x - x) < Math.abs(pts[best].x - x)) best = i;
        setSel(sel === best ? null : best);
      }}
    >
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id}-fill)`} className="animate-fade" />
      {children}
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" className="chart-draw" pathLength={1} />
      {pts.map((q, i) => (
        <circle
          key={q.day}
          cx={q.x}
          cy={q.y}
          r={sel === i ? 6 : 3.5}
          fill={sel === i ? color : "var(--surface)"}
          stroke={color}
          strokeWidth={2}
          style={{ transition: "r 160ms" }}
        />
      ))}
      {p ? (
        <g style={{ pointerEvents: "none" }}>
          <line x1={p.x} x2={p.x} y1={p.y + 8} y2={H} stroke={color} strokeDasharray="2 3" opacity={0.6} />
          <g transform={`translate(${Math.min(Math.max(p.x, 34), W - 34)}, ${Math.max(p.y - 28, -18)})`}>
            <rect x={-34} y={-12} width={68} height={24} rx={12} fill={color} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={10.5} fontWeight={700} fill="#fff">
              {format(p.value)} · {short(p.day)}
            </text>
          </g>
        </g>
      ) : null}
    </svg>
  );
}

const GOOD_MOODS = new Set(["calm", "happy", "energetic", "playful"]);
const DESIRE_LEVEL: Record<string, number> = { "x:low": 1, "x:mid": 2, "x:high": 3 };
const PHASE_ROWS: { key: Phase; label: string }[] = [
  { key: "period", label: "Месячные" },
  { key: "follicular", label: "После месячных" },
  { key: "fertile", label: "Фертильные дни" },
  { key: "luteal", label: "Перед месячными" },
];

/**
 * Настроение и желание по фазам цикла — по прошлым циклам с настоящими
 * датами. Строка фазы появляется, когда в ней хотя бы 3 отметки.
 */
function PhaseInsights() {
  const { days, periods } = useFem();
  const rows = useMemo(() => {
    const acc = new Map<Phase, { good: number; moods: number; desire: number; desires: number }>();
    for (const d of days.values()) {
      let ph = pastPhase(periods, d.day);
      if (!ph) continue;
      if (ph === "ovulation") ph = "fertile";
      const a = acc.get(ph) ?? { good: 0, moods: 0, desire: 0, desires: 0 };
      for (const m of moodsOf(d)) {
        a.moods++;
        if (GOOD_MOODS.has(m)) a.good++;
      }
      const lvl = d.tags.map((t) => DESIRE_LEVEL[t]).find(Boolean);
      if (lvl) {
        a.desire += lvl;
        a.desires++;
      }
      acc.set(ph, a);
    }
    return PHASE_ROWS.map((p) => {
      const a = acc.get(p.key);
      return {
        ...p,
        mood: a && a.moods >= 3 ? a.good / a.moods : null,
        desire: a && a.desires >= 3 ? a.desire / a.desires / 3 : null,
      };
    });
  }, [days, periods]);
  const withMood = rows.filter((r) => r.mood != null);
  const withDesire = rows.filter((r) => r.desire != null);
  if (withMood.length < 2 && withDesire.length < 2) return null;
  const best = (list: typeof rows, key: "mood" | "desire") => [...list].sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))[0];
  const worst = (list: typeof rows) => [...list].sort((a, b) => (a.mood ?? 0) - (b.mood ?? 0))[0];
  return (
    <div className="fem-card mt-3 rounded-3xl p-4">
      <p className="text-[0.9375rem] font-semibold">Настроение и желание по фазам</p>
      <p className="mb-3 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        По вашим отметкам в прошлых циклах
      </p>
      <div className="space-y-2.5">
        {rows.filter((r) => r.mood != null || r.desire != null).map((r) => (
          <div key={r.key}>
            <span className="flex items-center gap-1.5 text-[0.75rem] font-medium">
              <span className="h-2 w-2 rounded-full" style={{ background: PHASE_COLOR[r.key] }} />
              {r.label}
            </span>
            <Bar label="хорошее настроение" value={r.mood} color="#f472b6" />
            <Bar label="желание" value={r.desire} color="#a78bfa" />
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.8125rem] leading-snug">
        {withMood.length >= 2 ? `Лучше всего настроение — «${best(withMood, "mood").label.toLowerCase()}», ниже всего — «${worst(withMood).label.toLowerCase()}». ` : ""}
        {withDesire.length >= 2 ? `Желание сильнее всего — «${best(withDesire, "desire").label.toLowerCase()}».` : ""}
      </p>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <span className="mt-1 flex items-center gap-2">
      <span className="w-[8.5rem] shrink-0 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
        {value != null ? (
          <span className="animate-grow-x block h-full rounded-full" style={{ width: `${Math.max(4, value * 100)}%`, background: color }} />
        ) : null}
      </span>
      <span className="w-9 text-right text-[0.6875rem] tabular-nums" style={{ color: "var(--muted)" }}>
        {value != null ? `${Math.round(value * 100)}%` : "—"}
      </span>
    </span>
  );
}

/** Вес за последние месяцы: линия и изменение за 30 дней. */
function WeightChart() {
  const { days } = useFem();
  const now = today();
  const pts = [...days.values()]
    .filter((d) => d.weight != null && daysBetween(d.day, now) <= 180)
    .map((d) => ({ day: d.day, w: Number(d.weight) }))
    .sort((a, b) => a.day.localeCompare(b.day));
  if (pts.length < 2) return null;
  const W = 320;
  const H = 100;
  const from = pts[0].day;
  const total = Math.max(daysBetween(from, now), 14);
  const lo = Math.min(...pts.map((p) => p.w)) - 0.5;
  const hi = Math.max(...pts.map((p) => p.w)) + 0.5;
  const x = (d: string) => 8 + (daysBetween(from, d) / total) * (W - 16);
  const y = (w: number) => 8 + (1 - (w - lo) / (hi - lo)) * (H - 16);
  const lastW = pts[pts.length - 1].w;
  const monthAgo = [...pts].reverse().find((p) => daysBetween(p.day, now) >= 25);
  const diff = monthAgo ? Math.round((lastW - monthAgo.w) * 10) / 10 : null;
  return (
    <div className="fem-card mt-3 rounded-3xl p-4">
      <p className="text-[0.9375rem] font-semibold">Вес</p>
      <p className="mb-2 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        Сейчас {String(lastW).replace(".", ",")} кг
        {diff != null ? ` · ${diff > 0 ? "+" : ""}${String(diff).replace(".", ",")} кг за месяц` : ""}
        {" · "}к месячным вес часто подрастает на 0,5–2 кг из-за воды — это нормально
      </p>
      <SmoothChart
        W={W}
        H={H}
        color="#a78bfa"
        format={(v) => `${String(v).replace(".", ",")} кг`}
        pts={pts.map((p) => ({ x: x(p.day), y: y(p.w), day: p.day, value: p.w }))}
      />
      <div className="mt-1 flex justify-between text-[0.625rem] tabular-nums" style={{ color: "var(--muted)" }}>
        <span>{short(from)}</span>
        <span>{short(now)}</span>
      </div>
    </div>
  );
}

/** Стресс и длина цикла, активность за месяц. */
function Lifestyle() {
  const { days, periods } = useFem();
  const now = today();
  const data = useMemo(() => {
    const starts = [...periods].map((p) => p.start_date).sort();
    const stress: number[] = [];
    const calm: number[] = [];
    for (let i = 1; i < starts.length; i++) {
      const len = daysBetween(starts[i - 1], starts[i]);
      if (len < 15 || len > 60) continue;
      const n = [...days.values()].filter((d) => d.day >= starts[i - 1] && d.day < starts[i] && d.tags.includes("o:stress")).length;
      (n >= 2 ? stress : calm).push(len);
    }
    const avg = (l: number[]) => l.reduce((a, b) => a + b, 0) / l.length;
    const stressDiff = stress.length && calm.length ? Math.round(avg(stress) - avg(calm)) : null;
    const month = [...days.values()].filter((d) => daysBetween(d.day, now) < 30 && d.day <= now);
    const active = month.filter((d) => d.tags.some((t) => t.startsWith("a:") && t !== "a:none"));
    const counts = new Map<string, number>();
    for (const d of active) for (const t of d.tags) if (t.startsWith("a:") && t !== "a:none") counts.set(t, (counts.get(t) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1])[0];
    return { stressDiff, activeDays: active.length, top: top ? ACTIVITY.find((a) => a.value === top[0]) : null };
  }, [days, periods, now]);
  if (data.stressDiff == null && data.activeDays === 0) return null;
  return (
    <div className="fem-card mt-3 rounded-3xl p-4 text-[0.8125rem] leading-snug">
      <p className="mb-2 text-[0.9375rem] font-semibold">Образ жизни</p>
      {data.stressDiff != null ? (
        <p className="mb-1.5">
          ⚡{" "}
          {Math.abs(data.stressDiff) < 2
            ? "Стресс на длину цикла у вас почти не влияет."
            : `В циклы со стрессом месячные приходили в среднем на ${Math.abs(data.stressDiff)} ${plural(Math.abs(data.stressDiff), "день", "дня", "дней")} ${data.stressDiff > 0 ? "позже" : "раньше"}.`}
        </p>
      ) : null}
      {data.activeDays > 0 ? (
        <p>
          {data.top?.emoji ?? "🏃"} Активных дней за месяц: {data.activeDays}
          {data.top ? ` · чаще всего — ${data.top.label.toLowerCase()}` : ""}. Движение помогает при ПМС и спазмах.
        </p>
      ) : null}
    </div>
  );
}
