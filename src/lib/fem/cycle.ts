/**
 * Расчёт цикла FemDots. Чистые функции без React и базы — основу повторяет
 * SQL напоминаний (due_fem_reminders): средний цикл — по последним шести
 * промежуткам между началами месячных, от 15 до 60 дней.
 *
 * Опора — общепринятые клинические правила, а не догадки:
 * - вторая (лютеиновая) фаза стабильнее первой — около 14 дней, у каждой
 *   своя (10–16); поэтому овуляцию считаем назад от следующих месячных,
 *   а свою длину фазы берём из циклов с подтверждённой овуляцией;
 * - овуляцию подтверждают положительный тест на ЛГ (через 24–36 ч) и
 *   скачок базальной температуры (три дня выше максимума шести
 *   предыдущих, третий — на 0,2° и больше);
 * - фертильное окно — пять дней до овуляции и сама овуляция (+ день
 *   запаса после);
 * - норма цикла по FIGO: 24–38 дней, месячные до 8 дней, разброс между
 *   циклами — не больше 7–9 дней;
 * - на гормональной контрацепции овуляции нет: кровотечение — по схеме
 *   упаковки, фертильного окна нет.
 *
 * Это всё равно оценка, а не диагноз и не способ предохранения.
 */
import { addDays } from "@/lib/tasks/dates";

export interface FemPeriod {
  id: string;
  start_date: string;
  /** null — месячные ещё идут. */
  end_date: string | null;
}

export type Goal = "track" | "conceive" | "avoid";
export type Method = "none" | "coc" | "pop" | "iud_hormonal" | "iud_copper" | "implant" | "injection" | "ring" | "patch";

/** Гормональный метод — овуляция подавлена (кроме медной спирали). */
export const isHormonal = (m: Method | undefined | null) => !!m && m !== "none" && m !== "iud_copper";

export interface FemSettings {
  cycle_length: number;
  period_length: number;
  goal: Goal;
  method: Method;
  /** Начало упаковки / кольца / пластыря, дата укола или установки. */
  method_start: string | null;
  pack_active: number;
  pack_break: number;
  /** Режим беременности: с какого дня включён. null — выключен. */
  pregnant_since: string | null;
  /** Согласие на разбор цикла нейросетью (обезличенная сводка в OpenRouter). */
  ai_consent_at: string | null;
  /** Свои статусы и просьбы — к готовым. */
  custom_statuses: { emoji: string; label: string }[];
  custom_asks: { emoji: string; label: string }[];
  /** «Что я люблю» — видит партнёр: ключ из LIKES → текст. */
  likes?: Partial<Record<string, string>>;
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
  /** Тест на овуляцию (ЛГ). */
  lh: "neg" | "pos" | null;
  /** Базальная температура, °C. */
  temp: number | null;
  /** ec — экстренная контрацепция, stim — стимуляция овуляции, hormones — другие гормоны. */
  meds: string[];
  /** Таблетка за день выпита. */
  pill: boolean | null;
  /** Статус дня для партнёра. */
  status: string | null;
  /**
   * Остальные разделы дневника, ключи с префиксом: d: — выделения,
   * s: — близость (подробности, только ей), x: — желание, o: — другое,
   * a: — активность.
   */
  tags: string[];
  weight: number | null;
  preg_test: "none" | "neg" | "faint" | "pos" | null;
  /** Настроение за день по времени; mood — последнее из них. */
  mood_log?: MoodMark[];
}

export interface MoodMark {
  /** Когда отмечено, ISO. */
  at: string;
  mood: string;
}

/** Все настроения дня: лента, а у старых дней — единственное mood. */
export function moodsOf(d: Pick<FemDay, "mood" | "mood_log">): string[] {
  if (d.mood_log?.length) return d.mood_log.map((x) => x.mood);
  return d.mood ? [d.mood] : [];
}

export type Flow = "spotting" | "light" | "medium" | "heavy";
export type Phase = "period" | "follicular" | "fertile" | "ovulation" | "luteal" | "late" | "protected" | "pregnant";

export const FEM_COLOR = "#ec4899";
/** Нежная палитра фаз: пастель, но различимая и в тёмной теме. */
export const PHASE_COLOR: Record<Phase, string> = {
  period: "#fb7185",
  follicular: "#f9c4dc",
  fertile: "#5eead4",
  ovulation: "#14b8a6",
  luteal: "#d8b4fe",
  late: "#fbbf24",
  protected: "#c4b5fd",
  pregnant: "#f9a8d4",
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
  /** Когда вероятнее всего начнутся: от и до (разброс по прошлым циклам). */
  nextRange: [string, string] | null;
  daysToNext: number | null;
  /** Задержка в днях, если следующие месячные уже должны были начаться. */
  late: number;
  /** Идущие сейчас месячные (отметка без конца или сегодня внутри отметки). */
  current: FemPeriod | null;
  ovulation: string | null;
  /** Овуляция подтверждена тестом на ЛГ, температурой или выделениями — не только прогноз. */
  ovulationBy: "lh" | "temp" | "mucus" | null;
  fertileStart: string | null;
  fertileEnd: string | null;
  /** Своя длина второй фазы — по циклам с подтверждённой овуляцией. */
  luteal: number;
  phase: Phase | null;
  hormonal: boolean;
  /** Схема упаковки (таблетки, кольцо, пластырь): какой день и перерыв ли. */
  pack: { day: number; active: number; length: number; inBreak: boolean } | null;
  /** Режим беременности: срок от первого дня последних месячных и примерная дата родов. */
  pregnancy: { weeks: number; days: number; due: string } | null;
}

/** Что, кроме дат месячных, уточняет прогноз. */
export interface CycleSignals {
  /** Дни положительных тестов на ЛГ. */
  lhDays?: string[];
  /** Базальная температура по дням. */
  temps?: { day: string; temp: number }[];
  /** Дни экстренной контрацепции — следующие месячные могут сдвинуться. */
  ecDays?: string[];
  /** Дни выделений «тягучие, как белок» — пик фертильности. */
  mucusDays?: string[];
  pregnantSince?: string | null;
  method?: Method;
  methodStart?: string | null;
  packActive?: number;
  packBreak?: number;
}

/** Всё нужное для прогноза из дневника. */
export function signalsFrom(days: Map<string, FemDay>, settings: FemSettings | null): CycleSignals {
  const lhDays: string[] = [];
  const temps: { day: string; temp: number }[] = [];
  const ecDays: string[] = [];
  const mucusDays: string[] = [];
  for (const d of days.values()) {
    if (d.tags?.includes("d:eggwhite")) mucusDays.push(d.day);
    if (d.lh === "pos") lhDays.push(d.day);
    if (d.temp != null) temps.push({ day: d.day, temp: Number(d.temp) });
    if (d.meds?.includes("ec")) ecDays.push(d.day);
  }
  temps.sort((a, b) => a.day.localeCompare(b.day));
  return {
    lhDays: lhDays.sort(),
    temps,
    ecDays,
    mucusDays: mucusDays.sort(),
    pregnantSince: settings?.pregnant_since ?? null,
    method: settings?.method ?? "none",
    methodStart: settings?.method_start ?? null,
    packActive: settings?.pack_active ?? 21,
    packBreak: settings?.pack_break ?? 7,
  };
}

/**
 * Скачок базальной температуры: три дня подряд выше максимума шести
 * предыдущих замеров, третий — хотя бы на 0,2° выше. Овуляция — день
 * перед первым высоким.
 */
export function tempShift(temps: { day: string; temp: number }[], from: string, to: string): string | null {
  const list = temps.filter((t) => t.day >= from && t.day < to);
  for (let i = 6; i + 2 < list.length; i++) {
    const cover = Math.max(...list.slice(i - 6, i).map((t) => t.temp));
    const [a, b, c] = [list[i], list[i + 1], list[i + 2]];
    if (a.temp > cover && b.temp > cover && c.temp >= cover + 0.2) return addDays(a.day, -1);
  }
  return null;
}

/**
 * Овуляция в промежутке [from, to): по ЛГ (день теста + 1), по температуре
 * или — менее точно — по последнему дню выделений «как белок» (пик-день
 * по методу Биллингса: овуляция обычно в этот день или на следующий).
 */
function confirmedOvulation(
  sig: CycleSignals,
  from: string,
  to: string,
  withMucus = true,
): { day: string; by: "lh" | "temp" | "mucus" } | null {
  // Тест в первые дни цикла — не тот пик (часто ложный на месячных).
  const lh = sig.lhDays?.find((d) => d >= addDays(from, 5) && d < to);
  if (lh) return { day: addDays(lh, 1), by: "lh" };
  const t = sig.temps?.length ? tempShift(sig.temps, from, to) : null;
  if (t) return { day: t, by: "temp" };
  if (!withMucus) return null;
  const mucus = sig.mucusDays?.filter((d) => d >= addDays(from, 5) && d < to) ?? [];
  return mucus.length ? { day: mucus[mucus.length - 1], by: "mucus" } : null;
}

/** Своя длина второй фазы: от подтверждённой овуляции до следующих месячных. */
function personalLuteal(starts: string[], sig: CycleSignals): number {
  const out: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const ov = confirmedOvulation(sig, starts[i - 1], starts[i], false);
    if (!ov) continue;
    const l = daysBetween(ov.day, starts[i]);
    if (l >= 10 && l <= 16) out.push(l);
  }
  if (out.length === 0) return 14;
  return Math.round(out.slice(-4).reduce((a, b) => a + b, 0) / Math.min(out.length, 4));
}

/** Разброс прогноза ± дней: по колебаниям прошлых циклов. */
function spreadOf(lengths: number[]): number {
  if (lengths.length < 2) return 3;
  const recent = lengths.slice(-6);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const sd = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
  return Math.min(5, Math.max(1, Math.round(sd)));
}

export function cycleInfo(
  periods: FemPeriod[],
  settings: Pick<FemSettings, "cycle_length" | "period_length">,
  today: string,
  sig: CycleSignals = {},
): CycleInfo {
  const all = sorted(periods);
  const list = all.filter((p) => p.start_date <= today);
  const last = list[list.length - 1] ?? null;
  const cycleLength = averageCycle(periods, settings.cycle_length);
  const periodLength = averagePeriod(periods, settings.period_length);
  const hormonal = isHormonal(sig.method);
  const pack = packOf(sig, today);
  const luteal = personalLuteal(list.map((p) => p.start_date), sig);
  const empty: CycleInfo = {
    lastStart: null, cycleDay: null, cycleLength, periodLength, nextStart: null, nextRange: null, daysToNext: null,
    late: 0, current: null, ovulation: null, ovulationBy: null, fertileStart: null, fertileEnd: null, luteal,
    phase: hormonal ? "protected" : null, hormonal, pack, pregnancy: null,
  };
  // Беременность: срок — от первого дня последних месячных (как считают
  // врачи), дата родов — +280 дней (правило Негеле). Прогноз — на паузе.
  if (sig.pregnantSince) {
    const lmp = last && last.start_date <= sig.pregnantSince ? last.start_date : addDays(sig.pregnantSince, -14);
    const total = Math.max(0, daysBetween(lmp, today));
    return {
      ...empty, lastStart: lmp, cycleDay: total + 1, hormonal: false, pack: null, phase: "pregnant",
      pregnancy: { weeks: Math.floor(total / 7), days: total % 7, due: addDays(lmp, 280) },
    };
  }
  if (!last) {
    if (pack && sig.packBreak) {
      const next = nextBleed(pack, today);
      return { ...empty, nextStart: next, nextRange: [next, addDays(next, 2)], daysToNext: daysBetween(today, next) };
    }
    return empty;
  }
  const cycleDay = daysBetween(last.start_date, today) + 1;
  // Незакрытая отметка «идёт» не дольше 15 дней — дальше это забытая отметка.
  const current =
    (last.end_date ? today <= last.end_date : cycleDay <= Math.max(periodLength + 3, 10)) ? last : null;

  // На гормональной контрацепции овуляции нет: следующее кровотечение —
  // по схеме упаковки (через 1–3 дня после начала перерыва), а без
  // перерыва и у непрерывных методов — не предсказываем вовсе.
  if (hormonal) {
    const next = pack && sig.packBreak ? nextBleed(pack, today) : null;
    return {
      ...empty, lastStart: last.start_date, cycleDay, current,
      nextStart: next, nextRange: next ? [next, addDays(next, 2)] : null,
      daysToNext: next ? daysBetween(today, next) : null,
      phase: current ? "period" : "protected",
    };
  }

  // Овуляция этого цикла уже подтверждена — следующие месячные считаем от
  // неё (своя вторая фаза), разброс маленький. Иначе — от среднего цикла.
  const confirmed = confirmedOvulation(sig, last.start_date, addDays(today, 1));
  const lengths = cycleLengths(periods);
  let nextStart: string;
  let spread: number;
  let ovulation: string;
  if (confirmed) {
    ovulation = confirmed.day;
    nextStart = addDays(ovulation, luteal);
    spread = confirmed.by === "mucus" ? 2 : 1;
  } else {
    nextStart = addDays(last.start_date, cycleLength);
    ovulation = addDays(nextStart, -luteal);
    spread = spreadOf(lengths);
  }
  // Экстренная контрацепция в этом цикле может сдвинуть месячные на неделю.
  if (sig.ecDays?.some((d) => d >= last.start_date && d <= today)) spread = Math.min(7, spread + 4);
  const daysToNext = daysBetween(today, nextStart);
  const late = daysToNext < 0 && !current ? -daysToNext : 0;
  const fertileStart = addDays(ovulation, -5);
  const fertileEnd = addDays(ovulation, 1);
  return {
    lastStart: last.start_date, cycleDay, cycleLength, periodLength, nextStart,
    nextRange: [addDays(nextStart, -spread), addDays(nextStart, spread)],
    daysToNext, late, current,
    ovulation, ovulationBy: confirmed?.by ?? null, fertileStart, fertileEnd, luteal, hormonal, pack: null, pregnancy: null,
    phase: phaseOf(today, { lastStart: last.start_date, periodEnd: current ? null : last.end_date, periodLength, nextStart, ovulation, fertileStart, fertileEnd, current: !!current, late }),
  };
}

/** День упаковки: таблетки — по схеме, кольцо и пластырь — 21 + 7. */
function packOf(sig: CycleSignals, today: string): CycleInfo["pack"] {
  if (!sig.methodStart || today < sig.methodStart) return null;
  const fixed = sig.method === "ring" || sig.method === "patch";
  if (sig.method !== "coc" && !fixed) return null;
  const active = fixed ? 21 : sig.packActive ?? 21;
  const brk = fixed ? 7 : sig.packBreak ?? 7;
  const length = active + brk;
  const day = (daysBetween(sig.methodStart, today) % length) + 1;
  return { day, active, length, inBreak: day > active };
}

/** Ближайшее кровотечение отмены: второй день перерыва. */
function nextBleed(pack: NonNullable<CycleInfo["pack"]>, today: string): string {
  const breakStart = pack.inBreak ? addDays(today, -(pack.day - pack.active - 1)) : addDays(today, pack.active - pack.day + 1);
  const bleed = addDays(breakStart, 1);
  return bleed >= today ? bleed : addDays(bleed, pack.length);
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

/** Одна проверка по норме FIGO: что смотрели и что вышло. */
export interface HealthCheck {
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Сверка с нормой FIGO (2018): длина цикла 24–38 дней, месячные до 8 дней,
 * разброс между циклами не больше 9 дней. Флажок — только если отклонение
 * повторяется (два раза из последних шести): один сбой бывает у всех.
 */
export function cycleHealth(periods: FemPeriod[]): HealthCheck[] | null {
  const lengths = cycleLengths(periods).slice(-6);
  if (lengths.length < 2) return null;
  const durations = sorted(periods)
    .filter((p) => p.end_date)
    .map((p) => daysBetween(p.start_date, p.end_date!) + 1)
    .slice(-6);
  const short = lengths.filter((n) => n < 24).length;
  const long = lengths.filter((n) => n > 38).length;
  const longPeriods = durations.filter((n) => n > 8).length;
  const out: HealthCheck[] = [
    {
      label: "Длина цикла",
      ok: short < 2 && long < 2,
      detail:
        short >= 2
          ? `${short} из ${lengths.length} циклов короче 24 дней`
          : long >= 2
            ? `${long} из ${lengths.length} циклов длиннее 38 дней`
            : `от ${Math.min(...lengths)} до ${Math.max(...lengths)} дней — норма 24–38`,
    },
    {
      label: "Длительность месячных",
      ok: longPeriods < 2,
      detail: longPeriods >= 2 ? `${longPeriods} раза дольше 8 дней` : durations.length ? `до ${Math.max(...durations)} дней — норма до 8` : "пока мало отметок",
    },
  ];
  if (lengths.length >= 3) {
    const spread = Math.max(...lengths) - Math.min(...lengths);
    out.push({
      label: "Регулярность",
      ok: spread <= 9,
      detail: spread <= 9 ? `циклы отличаются на ${spread} дн. — норма до 7–9` : `разброс ${spread} дн. — больше нормы 7–9`,
    });
  }
  return out;
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
  // На гормональной контрацепции — только кровотечения отмены по упаковке.
  if (info.hormonal) {
    if (!info.pack) return marks;
    for (let k = 0; k < 4; k++) {
      const bleed = addDays(info.nextStart, k * info.pack.length);
      for (let i = 0; i < Math.min(4, info.pack.length - info.pack.active); i++) {
        const d = addDays(bleed, i);
        if (d > today && !marks.get(d)?.period) get(d).predicted = true;
      }
    }
    return marks;
  }
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
    const ov = addDays(next, -info.luteal);
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

/** Симптомы: тело и пищеварение — один список, в дневнике — два раздела. */
export const SYMPTOMS: { value: string; label: string; emoji: string; group?: "digestion" }[] = [
  { value: "ok", label: "Всё в порядке", emoji: "👍" },
  { value: "cramps", label: "Боли внизу живота", emoji: "⚡" },
  { value: "breasts", label: "Чувствительная грудь", emoji: "💗" },
  { value: "headache", label: "Головная боль", emoji: "🤕" },
  { value: "acne", label: "Прыщи", emoji: "🔴" },
  { value: "backache", label: "Боль в спине", emoji: "🔙" },
  { value: "fatigue", label: "Усталость", emoji: "🪫" },
  { value: "cravings", label: "Повышенный аппетит", emoji: "🍔" },
  { value: "insomnia", label: "Бессонница", emoji: "🌙" },
  { value: "bellyache", label: "Боль в животе", emoji: "😣" },
  { value: "itch", label: "Зуд во влагалище", emoji: "🌵" },
  { value: "dryness", label: "Сухость во влагалище", emoji: "🏜️" },
  { value: "nausea", label: "Тошнота", emoji: "🤢", group: "digestion" },
  { value: "bloating", label: "Вздутие живота", emoji: "🎈", group: "digestion" },
  { value: "constipation", label: "Запор", emoji: "🔒", group: "digestion" },
  { value: "diarrhea", label: "Диарея", emoji: "🚽", group: "digestion" },
];

export type TagOption = { value: string; label: string; emoji: string };

/** Вагинальные выделения (не месячные). «Тягучие, как белок» — признак фертильных дней. */
export const DISCHARGE: TagOption[] = [
  { value: "d:none", label: "Выделений нет", emoji: "🚫" },
  { value: "d:creamy", label: "Кремообразные", emoji: "🥛" },
  { value: "d:watery", label: "Водянистые", emoji: "💧" },
  { value: "d:sticky", label: "Липкие", emoji: "🍯" },
  { value: "d:eggwhite", label: "Тягучие, как белок", emoji: "🥚" },
  { value: "d:spotting", label: "Кровомажущие", emoji: "🩸" },
  { value: "d:unusual", label: "Нетипичные", emoji: "❓" },
  { value: "d:clumpy", label: "Белые, комковатые", emoji: "☁️" },
  { value: "d:grey", label: "Серые", emoji: "🌫️" },
];

/** Близость пары: видна обоим, у каждого вида — своя иконка в сердечке. */
export type IntimKind = "sex" | "oral" | "anal" | "touch";
export interface Intim {
  kinds: IntimKind[];
  /** Для «sex»: с защитой (true), без (false), не сказано (null). */
  protected: boolean | null;
  /** Видна ли отметка партнёру; по умолчанию — да. */
  shared?: boolean;
}

export const SHARED_KINDS: { value: Exclude<IntimKind, "sex">; label: string }[] = [
  { value: "oral", label: "Оральный секс" },
  { value: "anal", label: "Анальный секс" },
  { value: "touch", label: "Интимные прикосновения" },
];

/** Личное — только ей, лавандовые сердечки. */
export const SEX_TAGS: (TagOption & { heart: "toys" | "solo" | "orgasm" })[] = [
  { value: "s:masturbation", label: "Мастурбация", emoji: "", heart: "solo" },
  { value: "s:toys", label: "Секс-игрушки", emoji: "", heart: "toys" },
  { value: "s:orgasm", label: "Оргазм", emoji: "", heart: "orgasm" },
];

export const DESIRE: TagOption[] = [
  { value: "x:high", label: "Сильное желание", emoji: "🔥" },
  { value: "x:mid", label: "Среднее желание", emoji: "❤️" },
  { value: "x:low", label: "Слабое желание", emoji: "🤍" },
];

export const OTHER_TAGS: TagOption[] = [
  { value: "o:travel", label: "Путешествие", emoji: "📍" },
  { value: "o:stress", label: "Стресс", emoji: "⚡" },
  { value: "o:meditation", label: "Медитация", emoji: "🪷" },
  { value: "o:journal", label: "Дневник", emoji: "📔" },
  { value: "o:kegel", label: "Упражнения Кегеля", emoji: "🌀" },
  { value: "o:breathing", label: "Дыхательные упражнения", emoji: "🫁" },
  { value: "o:illness", label: "Болезнь или травма", emoji: "🩹" },
  { value: "o:alcohol", label: "Алкоголь", emoji: "🍷" },
];

export const ACTIVITY: TagOption[] = [
  { value: "a:none", label: "Без тренировки", emoji: "🛋️" },
  { value: "a:yoga", label: "Йога", emoji: "🧘" },
  { value: "a:gym", label: "Тренажёрный зал", emoji: "🏋️" },
  { value: "a:dance", label: "Аэробика и танцы", emoji: "💃" },
  { value: "a:swim", label: "Плавание", emoji: "🏊" },
  { value: "a:team", label: "Командный спорт", emoji: "🏀" },
  { value: "a:run", label: "Бег", emoji: "🏃" },
  { value: "a:bike", label: "Велосипед", emoji: "🚴" },
  { value: "a:walk", label: "Ходьба", emoji: "🚶" },
];

export const PREG_TESTS: { value: NonNullable<FemDay["preg_test"]>; label: string; emoji: string }[] = [
  { value: "none", label: "Не делала", emoji: "➖" },
  { value: "neg", label: "Отрицательный", emoji: "⚪" },
  { value: "faint", label: "Бледная полоска", emoji: "🌫️" },
  { value: "pos", label: "Положительный", emoji: "💗" },
];

export const MOODS: { value: string; label: string; emoji: string }[] = [
  { value: "calm", label: "Спокойствие", emoji: "😌" },
  { value: "happy", label: "Радость", emoji: "😊" },
  { value: "energetic", label: "Много энергии", emoji: "⚡️" },
  { value: "sad", label: "Грусть", emoji: "😢" },
  { value: "irritated", label: "Раздражение", emoji: "😠" },
  { value: "anxious", label: "Тревога", emoji: "😰" },
  { value: "tired", label: "Мало энергии", emoji: "😴" },
  { value: "playful", label: "Игривость", emoji: "😜" },
  { value: "swings", label: "Перепады настроения", emoji: "🎢" },
  { value: "down", label: "Подавленность", emoji: "😞" },
  { value: "apathy", label: "Апатия", emoji: "😶" },
  { value: "confused", label: "Растерянность", emoji: "😵‍💫" },
];

export const PHASE_TEXT: Record<Phase, { title: string; hint: string }> = {
  period: { title: "Месячные", hint: "Больше отдыха и тепла, меньше нагрузок" },
  follicular: { title: "Фолликулярная фаза", hint: "Энергии обычно больше — хорошее время для новых дел" },
  fertile: { title: "Фертильное окно", hint: "Высокая вероятность забеременеть" },
  ovulation: { title: "Овуляция", hint: "Самый вероятный день для зачатия" },
  luteal: { title: "Лютеиновая фаза", hint: "Ближе к месячным возможны ПМС и усталость" },
  late: { title: "Задержка", hint: "Цикл может сдвигаться из-за стресса, сна и болезни" },
  protected: { title: "Гормональная контрацепция", hint: "Овуляция подавлена — фертильного окна нет" },
  pregnant: { title: "Беременность", hint: "Прогноз месячных на паузе" },
};

export const GOALS: { value: Goal; label: string; hint: string }[] = [
  { value: "track", label: "Просто слежу", hint: "Прогноз месячных и самочувствие" },
  { value: "conceive", label: "Планируем беременность", hint: "Лучшие дни для зачатия — крупно" },
  { value: "avoid", label: "Избегаем беременности", hint: "Предупреждения в фертильные дни" },
];

export const METHODS: { value: Method; label: string; hint: string; start?: string }[] = [
  { value: "none", label: "Ничего не принимаю", hint: "Обычный прогноз цикла" },
  { value: "coc", label: "Комбинированные таблетки (КОК)", hint: "Ярина, Джес, Регулон и подобные", start: "Первый день текущей упаковки" },
  { value: "pop", label: "Мини-пили", hint: "Чарозетта, Лактинет и подобные — без перерыва" },
  { value: "ring", label: "Кольцо", hint: "НоваРинг: 3 недели кольцо, неделя перерыв", start: "Когда вставили текущее кольцо" },
  { value: "patch", label: "Пластырь", hint: "Евра: раз в неделю 3 недели, неделя перерыв", start: "Когда наклеили первый пластырь цикла" },
  { value: "injection", label: "Укол", hint: "Депо-Провера: раз в 12 недель", start: "Дата последнего укола" },
  { value: "implant", label: "Имплант", hint: "Импланон / Некспланон" },
  { value: "iud_hormonal", label: "Гормональная спираль", hint: "Мирена, Джейдесс" },
  { value: "iud_copper", label: "Медная спираль", hint: "Без гормонов — цикл и овуляция как обычно" },
];

export const MEDS: { value: string; label: string; emoji: string }[] = [
  { value: "ec", label: "Экстренная контрацепция", emoji: "🆘" },
  { value: "stim", label: "Стимуляция овуляции", emoji: "🌱" },
  { value: "hormones", label: "Другие гормоны", emoji: "💊" },
];

/**
 * Прогноз самочувствия: что из отмеченного повторялось в прошлых циклах в
 * тот же день цикла (±1). Первые дни считаем от начала месячных, остальные
 * — от следующих (ПМС привязан к ним). Показываем, только если повторялось
 * хотя бы в двух циклах и в половине тех, где вообще что-то отмечено.
 */
export function symptomForecast(
  periods: FemPeriod[],
  logs: { day: string; symptoms: string[] }[],
  info: CycleInfo,
  target: string,
): { value: string; hits: number; of: number }[] {
  if (!info.lastStart || info.hormonal || info.pregnancy) return [];
  const starts = sorted(periods).map((p) => p.start_date);
  const cycles: [string, string][] = [];
  for (let i = 1; i < starts.length; i++) {
    const gap = daysBetween(starts[i - 1], starts[i]);
    if (gap >= 15 && gap <= 60) cycles.push([starts[i - 1], starts[i]]);
  }
  const recent = cycles.slice(-6);
  const fromStart = daysBetween(info.lastStart, target);
  const useStart = fromStart <= 6 || !info.nextStart;
  const offset = useStart ? fromStart : daysBetween(target, info.nextStart!);
  const counts = new Map<string, number>();
  let observed = 0;
  for (const [a, b] of recent) {
    const inCycle = logs.filter((l) => l.day >= a && l.day < b && l.symptoms.length);
    if (inCycle.length === 0) continue;
    observed++;
    const seen = new Set<string>();
    for (const l of inCycle) {
      const off = useStart ? daysBetween(a, l.day) : daysBetween(l.day, b);
      if (Math.abs(off - offset) > 1) continue;
      for (const sym of l.symptoms) if (sym !== "ok") seen.add(sym);
    }
    for (const sym of seen) counts.set(sym, (counts.get(sym) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, n]) => n >= 2 && n / observed >= 0.5)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3)
    .map(([value, hits]) => ({ value, hits, of: observed }));
}

/** Фаза прошедшего дня — по настоящим датам месячных (для «Итогов»). */
export function pastPhase(periods: FemPeriod[], day: string, luteal = 14): Phase | null {
  const list = sorted(periods);
  let i = -1;
  for (let k = 0; k < list.length; k++) if (list[k].start_date <= day) i = k;
  if (i < 0 || i + 1 >= list.length) return null;
  const start = list[i].start_date;
  const next = list[i + 1].start_date;
  const gap = daysBetween(start, next);
  if (gap < 15 || gap > 60) return null;
  const end = list[i].end_date ?? addDays(start, 4);
  if (day <= end) return "period";
  const ov = addDays(next, -luteal);
  if (day === ov) return "ovulation";
  if (day >= addDays(ov, -5) && day <= addDays(ov, 1)) return "fertile";
  return day < ov ? "follicular" : "luteal";
}
