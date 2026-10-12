"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import {
  FEM_GRADIENT,
  ACTIVITY,
  DESIRE,
  DISCHARGE,
  FLOWS,
  MEDS,
  MOODS,
  OTHER_TAGS,
  PREG_TESTS,
  SEX_TAGS,
  SHARED_KINDS,
  cycleInfo,
  PHASE_COLOR,
  PHASE_TEXT,
  SYMPTOMS,
  daysBetween,
  type CycleInfo,
  type FemDay,
  type Goal,
  type Intim,
  type IntimKind,
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

/**
 * Подсказка, которую показываем, пока человек сам не попробовал: false —
 * ещё не знает (показать), true — уже понял. Память — телефона.
 */
export function useLearned(key: string): [boolean, () => void] {
  const [learned, setLearned] = useState(true);
  useEffect(() => {
    try {
      setLearned(localStorage.getItem(key) === "1");
    } catch {
      // Нет памяти — подсказку не навязываем.
    }
  }, [key]);
  const learn = () => {
    setLearned(true);
    try {
      localStorage.setItem(key, "1");
    } catch {
      // Не запомнили — покажем ещё раз, не страшно.
    }
  };
  return [learned, learn];
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
  pregnant: { title: "Беременность", hint: "40 недель — от первого дня последних месячных" },
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
  const preg = info.pregnancy;
  const N = preg
    ? 280
    : pack
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
  if (preg) {
    // Беременность — 40 недель кругом: пройденное ярче, впереди — бледнее.
    const done = Math.min(280, (info.cycleDay ?? 1));
    segments.push({ from: 1, to: done, color: "#f472b6", kind: "pregnant" });
    if (done < 280) segments.push({ from: done + 1, to: 280, color: PHASE_COLOR.pregnant, kind: "pregnant" });
  } else if (pack) {
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
  const [ringKnown, learnRing] = useLearned("fem.hint.ring");
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

  const day = preg ? Math.min(info.cycleDay ?? 1, 280) : pack ? pack.day : info.hormonal ? null : info.cycleDay ? Math.min(info.cycleDay, N) : null;
  const angle = day ? at(day) * 2 * Math.PI + Math.PI / N : 0;
  const mx = c + r * Math.sin(angle);
  const my = c - r * Math.cos(angle);

  let big = "";
  let small = "";
  let caption = "";
  if (preg) {
    big = `${preg.weeks}`;
    small = `${plural(preg.weeks, "неделя", "недели", "недель")}${preg.days ? ` и ${preg.days} дн.` : ""}`;
    caption = `роды ~${short(preg.due)}`;
  } else if (pack) {
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
    <>
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
                onClick={() => {
                  learnRing();
                  setPicked((p) => (p === i ? null : i));
                }}
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
    {!ringKnown && segments.length > 1 ? (
      <p className="animate-lift mt-2 text-center text-[0.75rem] font-medium" style={{ color: "var(--accent)" }}>
        👆 Нажмите на цветную часть кольца — покажу, что это за дни
      </p>
    ) : null}
    </>
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
 * Дневник дня — как во Flo, но короче: сверху то, что отмечают каждый
 * день (выделения, близость, самочувствие, настроение), остальное —
 * свёрнуто в «Ещё». Всё нажатием, сохраняется сразу.
 */
export function DayLog({ day, showFlow = true }: { day: string; showFlow?: boolean }) {
  const { days, saveDay, intimacy, setIntimacy, settings, periods, share } = useFem();
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
    tags: [],
    weight: null,
    preg_test: null,
  };
  const [note, setNote] = useState(entry.note ?? "");
  useEffect(() => setNote(entry.note ?? ""), [day, entry.note]);
  const filledMore =
    entry.tags.some((t) => /^(d|o|a):/.test(t)) ||
    entry.symptoms.some((v) => SYMPTOMS.find((x) => x.value === v)?.group === "digestion") ||
    !!entry.lh || entry.temp != null || entry.meds.length > 0 || entry.weight != null || !!entry.preg_test;
  const [more, setMore] = useState(filledMore || settings?.goal === "conceive");

  const toggleSymptom = (value: string) => {
    const on = entry.symptoms.includes(value);
    // «Всё в порядке» и жалобы друг друга исключают.
    const rest = value === "ok" ? [] : entry.symptoms.filter((x) => x !== "ok");
    void saveDay(day, { symptoms: on ? entry.symptoms.filter((x) => x !== value) : [...rest, value] });
  };
  /** Тег с префиксом: single — в группе выбирается один (выделения, желание). */
  const toggleTag = (value: string, single = false) => {
    const on = entry.tags.includes(value);
    const prefix = value.split(":")[0] + ":";
    const rest = single ? entry.tags.filter((x) => !x.startsWith(prefix)) : entry.tags;
    // «Без тренировки» / «Выделений нет» — тоже исключают остальные в группе.
    const none = value.endsWith(":none");
    const cleaned = none ? entry.tags.filter((x) => !x.startsWith(prefix)) : rest.filter((x) => x !== `${prefix}none`);
    void saveDay(day, { tags: on ? entry.tags.filter((x) => x !== value) : [...cleaned, value] });
  };

  // Близость — общая отметка пары.
  const intim = intimacy.get(day) ?? null;
  // Без защиты в фертильные дни, если беременность не планируется, — мягко подсказать.
  const risky = useMemo(() => {
    if (!intim?.kinds.includes("sex") || intim.protected !== false || settings?.goal === "conceive" || !settings) return false;
    if (settings.method !== "none") return false;
    const info = cycleInfo(periods, settings, day);
    return !!info.fertileStart && day >= info.fertileStart && day <= info.fertileEnd!;
  }, [intim, settings, periods, day]);

  const body = SYMPTOMS.filter((x) => !x.group);
  const digestion = SYMPTOMS.filter((x) => x.group === "digestion");

  return (
    <div className="space-y-4">
      {showFlow ? (
        <Group title="Месячные">
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

      <Group title="Близость вдвоём" hint={share?.partner_name ? `видно и ${share.partner_name}` : undefined}>
        <IntimacyPicker value={intim} onChange={(v) => void setIntimacy(day, v)} />
      </Group>
      <Group title="Только для вас">
        {SEX_TAGS.map((t) => (
          <Pill key={t.value} on={entry.tags.includes(t.value)} onClick={() => toggleTag(t.value)}>
            <ChipHeart kind={t.heart} />
            {t.label}
          </Pill>
        ))}
        {DESIRE.map((t) => (
          <Pill key={t.value} on={entry.tags.includes(t.value)} onClick={() => toggleTag(t.value, true)}>
            <span>{t.emoji}</span>
            {t.label}
          </Pill>
        ))}
      </Group>
      {risky ? (
        <p className="-mt-2 rounded-2xl px-3 py-2 text-[0.75rem] leading-snug" style={{ background: "color-mix(in srgb, #f59e0b 16%, transparent)" }}>
          Это фертильный день. Если беременность не планируется, экстренная контрацепция работает лучше всего в
          первые 72 часа — посоветуйтесь с врачом или фармацевтом.
        </p>
      ) : null}

      <Group title="Симптомы">
        {body.map((x) => (
          <Pill key={x.value} on={entry.symptoms.includes(x.value)} onClick={() => toggleSymptom(x.value)}>
            <span>{x.emoji}</span>
            {x.label}
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

      {more ? (
        <>
          <Group title="Выделения">
            {DISCHARGE.map((t) => (
              <Pill key={t.value} on={entry.tags.includes(t.value)} onClick={() => toggleTag(t.value, true)}>
                <span>{t.emoji}</span>
                {t.label}
              </Pill>
            ))}
          </Group>
          <Group title="Пищеварение">
            {digestion.map((x) => (
              <Pill key={x.value} on={entry.symptoms.includes(x.value)} onClick={() => toggleSymptom(x.value)}>
                <span>{x.emoji}</span>
                {x.label}
              </Pill>
            ))}
          </Group>
          <Group title="Тест на беременность">
            {PREG_TESTS.map((t) => (
              <Pill key={t.value} on={entry.preg_test === t.value} onClick={() => void saveDay(day, { preg_test: entry.preg_test === t.value ? null : t.value })}>
                <span>{t.emoji}</span>
                {t.label}
              </Pill>
            ))}
          </Group>
          <Group title="Тест на овуляцию (ЛГ)" hint="Положительный — прогноз станет точнее">
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
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Базальная t°"
              hint="утром, до подъёма"
              unit="°C"
              placeholder="36,60"
              value={entry.temp}
              min={34}
              max={39}
              digits={2}
              onSave={(v) => void saveDay(day, { temp: v })}
            />
            <NumberField
              label="Вес"
              unit="кг"
              placeholder="58,5"
              value={entry.weight}
              min={25}
              max={300}
              digits={1}
              onSave={(v) => void saveDay(day, { weight: v })}
            />
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
          <Group title="Что ещё было в этот день">
            {OTHER_TAGS.map((t) => (
              <Pill key={t.value} on={entry.tags.includes(t.value)} onClick={() => toggleTag(t.value)}>
                <span>{t.emoji}</span>
                {t.label}
              </Pill>
            ))}
          </Group>
          <Group title="Движение">
            {ACTIVITY.map((t) => (
              <Pill key={t.value} on={entry.tags.includes(t.value)} onClick={() => toggleTag(t.value)}>
                <span>{t.emoji}</span>
                {t.label}
              </Pill>
            ))}
          </Group>
        </>
      ) : (
        <button onClick={() => setMore(true)} className="flex items-center gap-1.5 text-[0.8125rem] font-medium" style={{ color: "var(--accent)" }}>
          <Icon name="plus" size={14} />
          Ещё: выделения, тесты, температура, вес, активность
        </button>
      )}

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

/** Число с единицей: температура, вес. Пусто — стереть; вне границ — вернуть как было. */
function NumberField({
  label,
  hint,
  unit,
  placeholder,
  value,
  min,
  max,
  digits,
  onSave,
}: {
  label: string;
  hint?: string;
  unit: string;
  placeholder: string;
  value: number | null;
  min: number;
  max: number;
  digits: number;
  onSave: (v: number | null) => void;
}) {
  const [text, setText] = useState(value != null ? String(value).replace(".", ",") : "");
  useEffect(() => setText(value != null ? String(value).replace(".", ",") : ""), [value]);
  const save = () => {
    if (text.trim() === "") {
      if (value != null) onSave(null);
      return;
    }
    const v = Number(text.replace(",", "."));
    if (!(v >= min && v <= max)) {
      setText(value != null ? String(value).replace(".", ",") : "");
      return;
    }
    const k = 10 ** digits;
    const next = Math.round(v * k) / k;
    if (next !== value) onSave(next);
  };
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--muted)" }}>
        {label}
        {hint ? <span className="font-normal"> · {hint}</span> : null}
      </span>
      <div className="flex items-center gap-1.5">
        <input
          inputMode="decimal"
          className={`${inputClass} text-center tabular-nums`}
          style={inputStyle}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 6))}
          onBlur={save}
        />
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold" style={{ color: "var(--muted)" }}>
        {title}
        {hint ? <span className="font-normal"> · {hint}</span> : null}
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

/**
 * Сердечко близости в календаре и на кнопках: внутри — иконка вида.
 * Общее для пары — розовое (без защиты — сплошное красное), личное — только
 * её, лавандовое.
 */
export type HeartKind = "protected" | "unprotected" | "oral" | "anal" | "touch" | "toys" | "solo" | "orgasm";

const HEART = "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z";
const PRIVATE_KINDS: HeartKind[] = ["toys", "solo", "orgasm"];
export const HEART_LABEL: Record<HeartKind, string> = {
  protected: "Секс с защитой",
  unprotected: "Секс без защиты",
  oral: "Оральный секс",
  anal: "Анальный секс",
  touch: "Интимные прикосновения",
  toys: "Секс-игрушки",
  solo: "Мастурбация",
  orgasm: "Оргазм",
};

/** Сердечко на кнопке — на белом кружке, чтобы не сливалось с розовой выбранной кнопкой. */
function ChipHeart({ kind }: { kind: HeartKind }) {
  return (
    <span className="-ml-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white">
      <IntimacyHeart kind={kind} size={16} />
    </span>
  );
}

export function IntimacyHeart({ kind, size = 12 }: { kind: HeartKind; size?: number }) {
  const fill = kind === "unprotected" ? "#e11d48" : PRIVATE_KINDS.includes(kind) ? "#a78bfa" : "#f472b6";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label={HEART_LABEL[kind]} className="shrink-0">
      <path d={HEART} fill={fill} />
      {kind === "protected" ? (
        // Щит — «с защитой».
        <path d="M12 7.6l4 1.5v3c0 2.6-1.8 4.3-4 5.1-2.2-.8-4-2.5-4-5.1v-3z" fill="#fff" />
      ) : kind === "oral" ? (
        // Язычок.
        <g>
          <path d="M9.2 9.4h5.6v3.8a2.8 2.8 0 0 1-5.6 0z" fill="#fff" />
          <path d="M12 9.6v3.4" stroke={fill} strokeWidth={1.1} strokeLinecap="round" />
        </g>
      ) : kind === "anal" ? (
        // Пробка.
        <g fill="#fff">
          <path d="M12 7.6c1.7 1.4 2.4 3 2 4.6-.3 1-1 1.5-2 1.5s-1.7-.5-2-1.5c-.4-1.6.3-3.2 2-4.6z" />
          <rect x="11.35" y="13.4" width="1.3" height="1.6" />
          <rect x="9.4" y="14.9" width="5.2" height="1.6" rx="0.8" />
        </g>
      ) : kind === "touch" ? (
        // Ладонь.
        <g stroke="#fff" strokeWidth={1.3} strokeLinecap="round" fill="#fff">
          <path d="M9.4 12h5.2v2.4a2.6 2.6 0 0 1-5.2 0z" stroke="none" />
          <path d="M9.9 9.4v3M11.4 8.7v3.3M12.9 8.7v3.3M14.3 9.4v3" fill="none" />
        </g>
      ) : kind === "toys" ? (
        // Игрушка.
        <g>
          <path d="M9.8 15.4l4.6-6.2" stroke="#fff" strokeWidth={2.8} strokeLinecap="round" />
          <circle cx="9.5" cy="15.9" r="1.3" fill="#fff" />
        </g>
      ) : kind === "solo" ? (
        <path d="M12 8l1.1 2.8 2.8 1.1-2.8 1.1L12 15.8l-1.1-2.8-2.8-1.1 2.8-1.1z" fill="#fff" />
      ) : kind === "orgasm" ? (
        <g fill="#fff">
          <path d="M11 8.6l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" />
          <circle cx="14.8" cy="9.2" r="0.9" />
          <circle cx="14.6" cy="14.4" r="0.7" />
        </g>
      ) : null}
    </svg>
  );
}

/** Какие сердечки у дня: общее (видно обоим) и — только у неё — личное. */
export function heartsOf(intim: Intim | null | undefined, tags?: string[]): HeartKind[] {
  const out: HeartKind[] = [];
  if (intim?.kinds.includes("sex")) out.push(intim.protected === false ? "unprotected" : "protected");
  for (const k of ["anal", "oral", "touch"] as const) if (intim?.kinds.includes(k)) out.push(k);
  if (tags?.includes("s:toys")) out.push("toys");
  if (tags?.includes("s:masturbation")) out.push("solo");
  if (tags?.includes("s:orgasm") && out.length === 0) out.push("orgasm");
  return out;
}

/** Главное сердечко дня — для календаря. */
export function heartOf(intim: Intim | null | undefined, tags?: string[]): HeartKind | null {
  return heartsOf(intim, tags)[0] ?? null;
}

/**
 * Выбор общей близости — у неё в дневнике и у партнёра в календаре.
 * Секс с защитой и без — взаимоисключающие, остальное — сколько угодно.
 */
export function IntimacyPicker({ value, onChange }: { value: Intim | null; onChange: (next: Intim | null) => void }) {
  const kinds = value?.kinds ?? [];
  const sexOn = kinds.includes("sex");
  const setSex = (prot: boolean) => {
    const same = sexOn && value?.protected === prot;
    const rest = kinds.filter((k) => k !== "sex");
    const next: IntimKind[] = same ? rest : [...rest, "sex"];
    onChange(next.length ? { kinds: next, protected: same ? null : prot } : null);
  };
  const toggle = (k: IntimKind) => {
    const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
    onChange(next.length ? { kinds: next, protected: next.includes("sex") ? (value?.protected ?? null) : null } : null);
  };
  return (
    <>
      <Pill on={sexOn && value?.protected !== false} onClick={() => setSex(true)}>
        <ChipHeart kind="protected" />
        Секс с защитой
      </Pill>
      <Pill on={sexOn && value?.protected === false} onClick={() => setSex(false)}>
        <ChipHeart kind="unprotected" />
        Секс без защиты
      </Pill>
      {SHARED_KINDS.map((k) => (
        <Pill key={k.value} on={kinds.includes(k.value)} onClick={() => toggle(k.value)}>
          <ChipHeart kind={k.value} />
          {k.label}
        </Pill>
      ))}
    </>
  );
}
