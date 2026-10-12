/**
 * Расчёт цикла FemDots. Чистые функции без React и базы — их же логику
 * повторяет SQL напоминаний (due_fem_reminders): средний цикл — по
 * последним шести промежуткам между началами месячных, от 15 до 60 дней.
 *
 * Всё это оценка по прошлым циклам, а не медицина: овуляцию считаем
 * классически — за 14 дней до следующих месячных, фертильное окно — пять
 * дней до неё и день после.
 */
import { addDays } from "@/lib/tasks/dates";

export interface FemPeriod {
  id: string;
  start_date: string;
  /** null — месячные ещё идут. */
  end_date: string | null;
}

export interface FemSettings {
  cycle_length: number;
  period_length: number;
  remind_period: boolean;
  remind_fertile: boolean;
  pill_on: boolean;
  pill_at: string;
  discreet: boolean;
  consent_at: string;
}

export interface FemDay {
  day: string;
  flow: Flow | null;
  symptoms: string[];
  mood: string | null;
  note: string | null;
}

export type Flow = "spotting" | "light" | "medium" | "heavy";
export type Phase = "period" | "follicular" | "fertile" | "ovulation" | "luteal" | "late";

export const FEM_COLOR = "#ec4899";
/** Нежная палитра фаз: пастель, но различимая и в тёмной теме. */
export const PHASE_COLOR: Record<Phase, string> = {
  period: "#fb7185",
  follicular: "#f9c4dc",
  fertile: "#5eead4",
  ovulation: "#14b8a6",
  luteal: "#d8b4fe",
  late: "#fbbf24",
};
/** Главная кнопка и выделенные плашки — мягкий градиент. */
export const FEM_GRADIENT = "linear-gradient(135deg, #f472b6 0%, #fb7185 55%, #fda4af 100%)";

/** Сколько дней от a до b (b − a). */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

const sorted = (periods: FemPeriod[]) => [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));

/** Длины прошлых циклов (между началами), без явно пропущенных отметок. */
export function cycleLengths(periods: FemPeriod[]): number[] {
  const list = sorted(periods);
  const out: number[] = [];
  for (let i = 1; i < list.length; i++) {
    const gap = daysBetween(list[i - 1].start_date, list[i].start_date);
    if (gap >= 15 && gap <= 60) out.push(gap);
  }
  return out;
}

export function averageCycle(periods: FemPeriod[], fallback: number): number {
  const recent = cycleLengths(periods).slice(-6);
  if (recent.length === 0) return fallback;
  return Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
}

/** Сколько обычно идут месячные — по закрытым отметкам. */
export function averagePeriod(periods: FemPeriod[], fallback: number): number {
  const done = sorted(periods)
    .filter((p) => p.end_date)
    .map((p) => daysBetween(p.start_date, p.end_date!) + 1)
    .filter((n) => n >= 1 && n <= 15)
    .slice(-6);
  if (done.length === 0) return fallback;
  return Math.round(done.reduce((a, b) => a + b, 0) / done.length);
}

export interface CycleInfo {
  lastStart: string | null;
  /** День цикла, с 1. */
  cycleDay: number | null;
  cycleLength: number;
  periodLength: number;
  nextStart: string | null;
  daysToNext: number | null;
  /** Задержка в днях, если следующие месячные уже должны были начаться. */
  late: number;
  /** Идущие сейчас месячные (отметка без конца или сегодня внутри отметки). */
  current: FemPeriod | null;
  ovulation: string | null;
  fertileStart: string | null;
  fertileEnd: string | null;
  phase: Phase | null;
}

export function cycleInfo(periods: FemPeriod[], settings: Pick<FemSettings, "cycle_length" | "period_length">, today: string): CycleInfo {
  const list = sorted(periods).filter((p) => p.start_date <= today);
  const last = list[list.length - 1] ?? null;
  const cycleLength = averageCycle(periods, settings.cycle_length);
  const periodLength = averagePeriod(periods, settings.period_length);
  if (!last) {
    return {
      lastStart: null, cycleDay: null, cycleLength, periodLength, nextStart: null, daysToNext: null,
      late: 0, current: null, ovulation: null, fertileStart: null, fertileEnd: null, phase: null,
    };
  }
  const cycleDay = daysBetween(last.start_date, today) + 1;
  // Незакрытая отметка «идёт» не дольше 15 дней — дальше это забытая отметка.
  const current =
    (last.end_date ? today <= last.end_date : cycleDay <= Math.max(periodLength + 3, 10)) ? last : null;
  const nextStart = addDays(last.start_date, cycleLength);
  const daysToNext = daysBetween(today, nextStart);
  const late = daysToNext < 0 && !current ? -daysToNext : 0;
  const ovulation = addDays(nextStart, -14);
  const fertileStart = addDays(ovulation, -5);
  const fertileEnd = addDays(ovulation, 1);
  return {
    lastStart: last.start_date, cycleDay, cycleLength, periodLength, nextStart, daysToNext, late, current,
    ovulation, fertileStart, fertileEnd,
    phase: phaseOf(today, { lastStart: last.start_date, periodEnd: current ? null : last.end_date, periodLength, nextStart, ovulation, fertileStart, fertileEnd, current: !!current, late }),
  };
}

function phaseOf(
  day: string,
  c: { lastStart: string; periodEnd: string | null; periodLength: number; nextStart: string; ovulation: string; fertileStart: string; fertileEnd: string; current: boolean; late: number },
): Phase {
  if (c.current) return "period";
  if (c.late > 0) return "late";
  if (day === c.ovulation) return "ovulation";
  if (day >= c.fertileStart && day <= c.fertileEnd) return "fertile";
  const periodEnd = c.periodEnd ?? addDays(c.lastStart, c.periodLength - 1);
  if (day <= periodEnd) return "period";
  if (day < c.fertileStart) return "follicular";
  return "luteal";
}

/** Что рисовать на дне календаря. */
export type DayMark = {
  /** Отмеченные месячные. */
  period: boolean;
  /** Прогноз месячных. */
  predicted: boolean;
  fertile: boolean;
  ovulation: boolean;
};

/**
 * Разметка календаря: отмеченные месячные, а вперёд — прогноз на три
 * цикла: месячные, фертильное окно и овуляция.
 */
export function buildMarks(periods: FemPeriod[], info: CycleInfo, today: string): Map<string, DayMark> {
  const marks = new Map<string, DayMark>();
  const get = (d: string) => {
    let m = marks.get(d);
    if (!m) {
      m = { period: false, predicted: false, fertile: false, ovulation: false };
      marks.set(d, m);
    }
    return m;
  };
  for (const p of periods) {
    // Идущие месячные — отмечены по сегодня, дальше — прогноз до обычной длины.
    const end = p.end_date ?? (p.id === info.current?.id ? today : addDays(p.start_date, info.periodLength - 1));
    for (let d = p.start_date; d <= end; d = addDays(d, 1)) get(d).period = true;
    if (!p.end_date && p.id === info.current?.id) {
      const planned = addDays(p.start_date, info.periodLength - 1);
      for (let d = addDays(today, 1); d <= planned; d = addDays(d, 1)) get(d).predicted = true;
    }
  }
  if (!info.nextStart) return marks;
  // Если задержка, прогноз сдвигаем: следующие — не раньше чем с завтра.
  let start = info.late > 0 ? addDays(today, 1) : info.nextStart;
  // Фертильное окно текущего цикла (до ближайших месячных).
  const windows: [string, string, string][] = [[info.fertileStart!, info.fertileEnd!, info.ovulation!]];
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < info.periodLength; i++) {
      const d = addDays(start, i);
      if (d > today && !marks.get(d)?.period) get(d).predicted = true;
    }
    const next = addDays(start, info.cycleLength);
    const ov = addDays(next, -14);
    windows.push([addDays(ov, -5), addDays(ov, 1), ov]);
    start = next;
  }
  for (const [from, to, ov] of windows) {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const m = get(d);
      if (!m.period) m.fertile = true;
    }
    if (!get(ov).period) get(ov).ovulation = true;
  }
  return marks;
}

export const FLOWS: { value: Flow; label: string; drops: number }[] = [
  { value: "spotting", label: "Мажущие", drops: 0 },
  { value: "light", label: "Слабые", drops: 1 },
  { value: "medium", label: "Средние", drops: 2 },
  { value: "heavy", label: "Обильные", drops: 3 },
];

export const SYMPTOMS: { value: string; label: string; emoji: string }[] = [
  { value: "cramps", label: "Спазмы", emoji: "⚡" },
  { value: "headache", label: "Голова", emoji: "🤕" },
  { value: "bloating", label: "Вздутие", emoji: "🎈" },
  { value: "breasts", label: "Грудь", emoji: "💗" },
  { value: "acne", label: "Высыпания", emoji: "🔴" },
  { value: "fatigue", label: "Усталость", emoji: "🥱" },
  { value: "cravings", label: "Тянет на сладкое", emoji: "🍫" },
  { value: "insomnia", label: "Бессонница", emoji: "🌙" },
  { value: "nausea", label: "Тошнота", emoji: "🤢" },
  { value: "backache", label: "Поясница", emoji: "🔙" },
];

export const MOODS: { value: string; label: string; emoji: string }[] = [
  { value: "calm", label: "Спокойно", emoji: "😌" },
  { value: "happy", label: "Радостно", emoji: "😊" },
  { value: "energetic", label: "Бодро", emoji: "⚡️" },
  { value: "sad", label: "Грустно", emoji: "😢" },
  { value: "irritated", label: "Раздражение", emoji: "😠" },
  { value: "anxious", label: "Тревожно", emoji: "😰" },
  { value: "tired", label: "Вяло", emoji: "😴" },
];

export const PHASE_TEXT: Record<Phase, { title: string; hint: string }> = {
  period: { title: "Месячные", hint: "Больше отдыха и тепла, меньше нагрузок" },
  follicular: { title: "Фолликулярная фаза", hint: "Энергии обычно больше — хорошее время для новых дел" },
  fertile: { title: "Фертильное окно", hint: "Высокая вероятность забеременеть" },
  ovulation: { title: "Овуляция", hint: "Самый вероятный день для зачатия" },
  luteal: { title: "Лютеиновая фаза", hint: "Ближе к месячным возможны ПМС и усталость" },
  late: { title: "Задержка", hint: "Цикл может сдвигаться из-за стресса, сна и болезни" },
};
