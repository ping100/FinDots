"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import {
  FEM_GRADIENT,
  FLOWS,
  MOODS,
  PHASE_COLOR,
  SYMPTOMS,
  daysBetween,
  type CycleInfo,
  type FemDay,
  type Phase,
} from "@/lib/fem/cycle";
import { phraseOf } from "@/lib/fem/phrases";
import { inputClass, inputStyle } from "@/components/ui";
import { useFem } from "./DataProvider";

/** «−  28 дней  +» — число с подписью. */
export function Stepper({
  label,
  value,
  min,
  max,
  unit,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  hint?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="mb-3">
      <span className="mb-1.5 block text-sm" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <div className="flex items-center gap-3">
        <StepButton onClick={() => onChange(Math.max(min, value - 1))}>−</StepButton>
        <span className="min-w-[6rem] text-center text-lg font-semibold tabular-nums">
          {value} <span className="text-sm font-normal">{unit}</span>
        </span>
        <StepButton onClick={() => onChange(Math.min(max, value + 1))}>+</StepButton>
      </div>
      {hint ? (
        <span className="mt-1 block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function StepButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full text-xl transition active:scale-90"
      style={{ background: "var(--surface-2)" }}
    >
      {children}
    </button>
  );
}

/**
 * Кольцо цикла — главный образ FemDots. Круг — это весь цикл, дуги — фазы
 * (месячные, фертильное окно, овуляция), белая точка — сегодня. В центре
 * — главное: сколько до месячных, какой день или задержка.
 */
export function CycleRing({ info, size = 256 }: { info: CycleInfo; size?: number }) {
  const N = info.cycleLength;
  const stroke = 20;
  const r = (size - stroke) / 2 - 6;
  const L = 2 * Math.PI * r;
  const c = size / 2;
  // День цикла (1…N) → доля окружности, начало — сверху.
  const at = (day: number) => (day - 1) / N;

  const segments: { from: number; to: number; color: string }[] = [];
  if (info.lastStart && info.fertileStart && info.ovulation && info.fertileEnd) {
    const fs = daysBetween(info.lastStart, info.fertileStart) + 1;
    const fe = daysBetween(info.lastStart, info.fertileEnd) + 1;
    const ov = daysBetween(info.lastStart, info.ovulation) + 1;
    const pl = Math.min(info.periodLength, fs - 1);
    segments.push({ from: 1, to: pl, color: PHASE_COLOR.period });
    if (fs - 1 > pl) segments.push({ from: pl + 1, to: fs - 1, color: PHASE_COLOR.follicular });
    if (ov - 1 >= fs) segments.push({ from: fs, to: ov - 1, color: PHASE_COLOR.fertile });
    segments.push({ from: ov, to: ov, color: PHASE_COLOR.ovulation });
    if (fe > ov) segments.push({ from: ov + 1, to: fe, color: PHASE_COLOR.fertile });
    if (N > fe) segments.push({ from: fe + 1, to: N, color: PHASE_COLOR.luteal });
  }

  const day = info.cycleDay ? Math.min(info.cycleDay, N) : null;
  const angle = day ? at(day) * 2 * Math.PI + Math.PI / N : 0;
  const mx = c + r * Math.sin(angle);
  const my = c - r * Math.cos(angle);

  let big = "";
  let small = "";
  let caption = "";
  if (!info.lastStart) {
    big = "—";
    small = "Отметьте начало месячных";
  } else if (info.current) {
    big = `${info.cycleDay}`;
    small = "день месячных";
    caption = `цикл ~${N} дней`;
  } else if (info.late > 0) {
    big = `${info.late}`;
    small = info.late === 1 ? "день задержки" : `${plural(info.late, "день", "дня", "дней")} задержки`;
    caption = `день цикла ${info.cycleDay}`;
  } else {
    big = `${info.daysToNext}`;
    small = info.daysToNext === 0 ? "месячные сегодня" : `${plural(info.daysToNext ?? 0, "день", "дня", "дней")} до месячных`;
    caption = `день цикла ${info.cycleDay}`;
  }

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" style={{ overflow: "visible" }} aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <g transform={`rotate(-90 ${c} ${c})`}>
          {segments.map((s, i) => {
            const start = at(s.from) * L;
            const len = ((s.to - s.from + 1) / N) * L;
            return (
              <circle
                key={i}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(len - 3, 1)} ${L}`}
                strokeDashoffset={-start}
                className="animate-grow-ring"
                style={{ animationDelay: `${i * 70}ms` }}
              />
            );
          })}
        </g>
        {day ? (
          <circle
            cx={mx}
            cy={my}
            r={stroke / 2 + 4}
            fill="#fff"
            stroke={info.late > 0 ? PHASE_COLOR.late : "#ec4899"}
            strokeWidth={3.5}
            style={{ filter: "drop-shadow(0 3px 8px rgba(236,72,153,0.45))" }}
          />
        ) : null}
      </svg>
      {/* Мягкое свечение внутри кольца — в цвет текущей фазы. */}
      <div
        className="animate-fem-glow pointer-events-none absolute rounded-full"
        style={{
          inset: stroke + 18,
          background: `radial-gradient(circle, color-mix(in srgb, ${info.phase ? PHASE_COLOR[info.phase] : "#f472b6"} 38%, transparent) 0%, transparent 70%)`,
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className={`text-[3.5rem] font-bold leading-none tabular-nums ${info.late > 0 ? "" : "fem-gradient-text"}`}
          style={info.late > 0 ? { color: PHASE_COLOR.late } : undefined}
        >
          {big}
        </span>
        <span className="mt-1 max-w-[9rem] text-sm font-medium leading-tight">{small}</span>
        {caption ? (
          <span className="mt-1 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            {caption}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Нажимаемая плашка выбора. */
export function Pill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] transition active:scale-95"
      style={{
        background: on ? FEM_GRADIENT : "var(--surface-2)",
        color: on ? "#fff" : "var(--text)",
        boxShadow: on ? "0 4px 12px -4px rgba(236,72,153,0.55)" : undefined,
      }}
    >
      {children}
    </button>
  );
}

/**
 * Самочувствие за день: выделения, симптомы, настроение, заметка. Всё
 * нажатием, без набора — сохраняется сразу.
 */
export function DayLog({ day, showFlow = true }: { day: string; showFlow?: boolean }) {
  const { days, saveDay } = useFem();
  const entry: FemDay = days.get(day) ?? { day, flow: null, symptoms: [], mood: null, note: null };
  const [note, setNote] = useState(entry.note ?? "");
  useEffect(() => setNote(entry.note ?? ""), [day, entry.note]);

  const toggleSymptom = (value: string) =>
    void saveDay(day, {
      symptoms: entry.symptoms.includes(value) ? entry.symptoms.filter((s) => s !== value) : [...entry.symptoms, value],
    });

  return (
    <div className="space-y-3.5">
      {showFlow ? (
        <Group title="Выделения">
          {FLOWS.map((f) => (
            <Pill key={f.value} on={entry.flow === f.value} onClick={() => void saveDay(day, { flow: entry.flow === f.value ? null : f.value })}>
              <span className="flex" style={{ color: entry.flow === f.value ? "#fff" : PHASE_COLOR.period }}>
                {f.drops === 0 ? <span className="text-xs">•</span> : Array.from({ length: f.drops }, (_, i) => <Icon key={i} name="drop" size={11} />)}
              </span>
              {f.label}
            </Pill>
          ))}
        </Group>
      ) : null}
      <Group title="Самочувствие">
        {SYMPTOMS.map((s) => (
          <Pill key={s.value} on={entry.symptoms.includes(s.value)} onClick={() => toggleSymptom(s.value)}>
            <span>{s.emoji}</span>
            {s.label}
          </Pill>
        ))}
      </Group>
      <Group title="Настроение">
        {MOODS.map((m) => (
          <Pill key={m.value} on={entry.mood === m.value} onClick={() => void saveDay(day, { mood: entry.mood === m.value ? null : m.value })}>
            <span>{m.emoji}</span>
            {m.label}
          </Pill>
        ))}
      </Group>
      <div>
        <span className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--muted)" }}>
          Заметка
        </span>
        <textarea
          className={`${inputClass} min-h-[3.5rem] resize-y`}
          style={inputStyle}
          value={note}
          maxLength={1000}
          placeholder="Что важно запомнить про этот день"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (entry.note ?? "") && void saveDay(day, { note: note.trim() || null })}
        />
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--muted)" }}>
        {title}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/**
 * Фраза дня крупно — первое, что видно на экране: что значит сегодняшний
 * день, простыми словами. Над ней мелко — фаза цикла.
 */
export function DayHero({ phase, day, who }: { phase: Phase; day: string; who: "own" | "partner" }) {
  const { lead, line } = phraseOf(phase, day, who);
  return (
    <div className="px-2 pb-6 pt-3 text-center">
      <p className="animate-lift flex items-center justify-center gap-2 text-[0.8125rem] font-medium" style={{ color: "var(--muted)" }}>
        <span className="h-2 w-2 rounded-full" style={{ background: PHASE_COLOR[phase] }} />
        {lead}
      </p>
      <h2
        className="animate-lift mx-auto mt-2 max-w-[20rem] text-balance text-[1.625rem] font-bold leading-[1.15] tracking-tight"
        style={{ animationDelay: "80ms" }}
      >
        {line}
      </h2>
    </div>
  );
}
