"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import {
  FEM_GRADIENT,
  FLOWS,
  MEDS,
  MOODS,
  PHASE_COLOR,
  PHASE_TEXT,
  SYMPTOMS,
  daysBetween,
  type CycleInfo,
  type FemDay,
  type Goal,
  type Phase,
} from "@/lib/fem/cycle";
import { phraseOf } from "@/lib/fem/phrases";
import { range, short } from "@/lib/fem/format";
import { addDays, today } from "@/lib/tasks/dates";
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

/** Что за дуга кольца — простыми словами, для подсказки по нажатию. */
const SEGMENT: Record<string, { title: string; hint: string }> = {
  period: { title: "Месячные", hint: PHASE_TEXT.period.hint },
  follicular: { title: "Энергии больше", hint: PHASE_TEXT.follicular.hint },
  fertile: { title: "Фертильное окно", hint: "Шанс забеременеть выше всего" },
  ovulation: { title: "Овуляция", hint: PHASE_TEXT.ovulation.hint },
  luteal: { title: "Перед месячными", hint: PHASE_TEXT.luteal.hint },
  pills: { title: "Дни с гормоном", hint: "Овуляции нет — вы под защитой" },
  break: { title: "Перерыв", hint: "Здесь начинается кровотечение отмены" },
  protected: { title: "Под защитой", hint: PHASE_TEXT.protected.hint },
};

/**
 * Кольцо цикла — главный образ FemDots. Круг — это весь цикл, дуги — фазы
 * (месячные, фертильное окно, овуляция), белая точка — сегодня. В центре
 * — главное: сколько до месячных, какой день или задержка. Нажатие на дугу
 * показывает в центре, что это за фаза и на какие дни она приходится.
 */
export function CycleRing({ info, size = 256 }: { info: CycleInfo; size?: number }) {
  // На таблетках / кольце / пластыре круг — это упаковка: дни с гормоном и перерыв.
  const pack = info.hormonal ? info.pack : null;
  // Овуляция подтверждена — длина этого цикла уже не средняя, а уточнённая.
  const N = pack
    ? pack.length
    : info.lastStart && info.nextStart && !info.hormonal
      ? Math.max(daysBetween(info.lastStart, info.nextStart), info.cycleDay ?? 0, 15)
      : info.cycleLength;
  const stroke = 20;
  const r = (size - stroke) / 2 - 6;
  const L = 2 * Math.PI * r;
  const c = size / 2;
  // День цикла (1…N) → доля окружности, начало — сверху.
  const at = (day: number) => (day - 1) / N;

  const segments: { from: number; to: number; color: string; kind: string }[] = [];
  if (pack) {
    segments.push({ from: 1, to: pack.active, color: PHASE_COLOR.protected, kind: "pills" });
    if (pack.length > pack.active) segments.push({ from: pack.active + 1, to: pack.length, color: PHASE_COLOR.period, kind: "break" });
  } else if (info.hormonal) {
    segments.push({ from: 1, to: N, color: PHASE_COLOR.protected, kind: "protected" });
  } else if (info.lastStart && info.fertileStart && info.ovulation && info.fertileEnd) {
    const fs = daysBetween(info.lastStart, info.fertileStart) + 1;
    const fe = daysBetween(info.lastStart, info.fertileEnd) + 1;
    const ov = daysBetween(info.lastStart, info.ovulation) + 1;
    const pl = Math.min(info.periodLength, fs - 1);
    segments.push({ from: 1, to: pl, color: PHASE_COLOR.period, kind: "period" });
    if (fs - 1 > pl) segments.push({ from: pl + 1, to: fs - 1, color: PHASE_COLOR.follicular, kind: "follicular" });
    if (ov - 1 >= fs) segments.push({ from: fs, to: ov - 1, color: PHASE_COLOR.fertile, kind: "fertile" });
    segments.push({ from: ov, to: ov, color: PHASE_COLOR.ovulation, kind: "ovulation" });
    if (fe > ov) segments.push({ from: ov + 1, to: fe, color: PHASE_COLOR.fertile, kind: "fertile" });
    if (N > fe) segments.push({ from: fe + 1, to: N, color: PHASE_COLOR.luteal, kind: "luteal" });
  }

  // Выбранная дуга: в центре — её название и даты; сама гаснет через 5 с.
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    if (picked === null) return;
    const t = setTimeout(() => setPicked(null), 5000);
    return () => clearTimeout(t);
  }, [picked]);
  // День кольца → дата: от начала цикла или, на упаковке, от сегодняшнего дня упаковки.
  const now = today();
  const dateOf = (k: number) =>
    pack ? addDays(now, k - pack.day) : info.lastStart ? addDays(info.lastStart, k - 1) : null;
  const sel = picked !== null ? segments[picked] : null;
  const selFrom = sel ? dateOf(sel.from) : null;
  const selTo = sel ? dateOf(sel.to) : null;

  const day = pack ? pack.day : info.hormonal ? null : info.cycleDay ? Math.min(info.cycleDay, N) : null;
  const angle = day ? at(day) * 2 * Math.PI + Math.PI / N : 0;
  const mx = c + r * Math.sin(angle);
  const my = c - r * Math.cos(angle);

  let big = "";
  let small = "";
  let caption = "";
  if (pack) {
    big = `${pack.inBreak ? pack.day - pack.active : pack.day}`;
    small = pack.inBreak ? `день перерыва из ${pack.length - pack.active}` : `день из ${pack.active}`;
    caption = info.nextStart ? `кровотечение ~${info.nextStart.slice(8, 10)}.${info.nextStart.slice(5, 7)}` : "";
  } else if (info.hormonal) {
    big = "✓";
    small = info.current ? `${info.cycleDay}-й день кровотечения` : "Под защитой";
    caption = "гормональная контрацепция";
  } else if (!info.lastStart) {
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
      <svg width={size} height={size} className="absolute inset-0" style={{ overflow: "visible" }}>
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
                className="animate-grow-ring cursor-pointer"
                role="button"
                aria-label={SEGMENT[s.kind]?.title}
                onClick={() => setPicked((p) => (p === i ? null : i))}
                style={{
                  animationDelay: `${i * 70}ms`,
                  pointerEvents: "stroke",
                  opacity: picked === null || picked === i ? 1 : 0.3,
                  transition: "opacity 200ms",
                }}
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
            style={{ filter: "drop-shadow(0 3px 8px rgba(236,72,153,0.45))", pointerEvents: "none" }}
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
      {sel ? (
        <button
          key={picked}
          onClick={() => setPicked(null)}
          className="animate-lift absolute flex flex-col items-center justify-center rounded-full px-4 text-center"
          style={{ inset: stroke + 22 }}
        >
          <span className="flex items-center gap-1.5 text-[0.9375rem] font-semibold">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: sel.color }} />
            {SEGMENT[sel.kind]?.title}
          </span>
          {selFrom && selTo ? (
            <span className="mt-1 text-[1.25rem] font-bold tabular-nums">
              {selFrom === selTo ? short(selFrom) : range(selFrom, selTo)}
            </span>
          ) : null}
          <span className="mt-1 max-w-[10rem] text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
            {SEGMENT[sel.kind]?.hint}
          </span>
        </button>
      ) : null}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center transition-opacity duration-200"
        style={{ opacity: sel ? 0 : 1 }}
      >
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
  const entry: FemDay = days.get(day) ?? {
    day,
    flow: null,
    symptoms: [],
    mood: null,
    note: null,
    lh: null,
    temp: null,
    meds: [],
    pill: null,
    status: null,
  };
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
      <Extras day={day} entry={entry} />
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

/**
 * Тесты на овуляцию, базальная температура и препараты — то, что делает
 * прогноз точнее. Свёрнуто, пока не нужно: большинству хватает основного.
 */
function Extras({ day, entry }: { day: string; entry: FemDay }) {
  const { saveDay, settings } = useFem();
  const filled = !!entry.lh || entry.temp != null || entry.meds.length > 0;
  const [open, setOpen] = useState(filled || settings?.goal === "conceive");
  const [temp, setTemp] = useState(entry.temp != null ? String(entry.temp) : "");
  useEffect(() => setTemp(entry.temp != null ? String(entry.temp) : ""), [day, entry.temp]);

  const saveTemp = () => {
    const v = Number(temp.replace(",", "."));
    const next = temp.trim() === "" ? null : v >= 34 && v <= 39 ? Math.round(v * 100) / 100 : undefined;
    if (next === undefined) {
      setTemp(entry.temp != null ? String(entry.temp) : "");
      return;
    }
    if (next !== entry.temp) void saveDay(day, { temp: next });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-[0.8125rem] font-medium" style={{ color: "var(--accent)" }}>
        <Icon name="plus" size={14} />
        Тест на овуляцию, температура, препараты
      </button>
    );
  }
  return (
    <>
      <Group title="Тест на овуляцию (ЛГ)">
        {(
          [
            ["neg", "Отрицательный", "➖"],
            ["pos", "Положительный", "✅"],
          ] as const
        ).map(([v, label, e]) => (
          <Pill key={v} on={entry.lh === v} onClick={() => void saveDay(day, { lh: entry.lh === v ? null : v })}>
            <span>{e}</span>
            {label}
          </Pill>
        ))}
      </Group>
      <div>
        <span className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--muted)" }}>
          Базальная температура (утром, до подъёма)
        </span>
        <div className="flex items-center gap-2">
          <input
            inputMode="decimal"
            className={`${inputClass} max-w-[7.5rem] text-center tabular-nums`}
            style={inputStyle}
            placeholder="36,60"
            value={temp}
            onChange={(e) => setTemp(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 5))}
            onBlur={saveTemp}
          />
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            °C
          </span>
        </div>
      </div>
      <Group title="Препараты">
        {MEDS.map((m) => {
          const on = entry.meds.includes(m.value);
          return (
            <Pill
              key={m.value}
              on={on}
              onClick={() => void saveDay(day, { meds: on ? entry.meds.filter((x) => x !== m.value) : [...entry.meds, m.value] })}
            >
              <span>{m.emoji}</span>
              {m.label}
            </Pill>
          );
        })}
      </Group>
    </>
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
export function DayHero({
  phase,
  day,
  who,
  goal = "track",
}: {
  phase: Phase;
  day: string;
  who: "own" | "partner";
  goal?: Goal | null;
}) {
  const { lead, line } = phraseOf(phase, day, who, goal);
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
