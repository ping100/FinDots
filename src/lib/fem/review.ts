/**
 * Разбор прошлого цикла — общий для ассистента по правилам (на экране) и
 * для нейросети (сводка уходит в OpenRouter только с согласия). Сводка
 * обезличена: длины, даты, частоты — без имени, заметок и подробностей
 * близости.
 */
import { addDays } from "@/lib/tasks/dates";
import {
  MOODS,
  SYMPTOMS,
  averageCycle,
  cycleHealth,
  cycleLengths,
  daysBetween,
  tempShift,
  type FemDay,
  type FemPeriod,
  type FemSettings,
} from "./cycle";

/** «1 раз», «3 раза», «5 раз». */
const times = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return `${n} ${m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "раза" : "раз"}`;
};

const GOOD = new Set(["calm", "happy", "energetic", "playful"]);
const label = (v: string) => SYMPTOMS.find((s) => s.value === v)?.label ?? MOODS.find((m) => m.value === v)?.label ?? v;

export interface CycleReview {
  start: string;
  end: string;
  length: number;
  periodDays: number | null;
  average: number;
  notes: string[];
  /** Что уходит нейросети — только с согласия. */
  summary: Record<string, unknown>;
}

/** Разбор последнего завершённого цикла: что было и что необычно. */
export function reviewLastCycle(periods: FemPeriod[], days: FemDay[], settings: FemSettings): CycleReview | null {
  const list = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (list.length < 2) return null;
  const prev = list[list.length - 2];
  const last = list[list.length - 1];
  const length = daysBetween(prev.start_date, last.start_date);
  if (length < 10 || length > 90) return null;
  const end = addDays(last.start_date, -1);
  const periodDays = prev.end_date ? daysBetween(prev.start_date, prev.end_date) + 1 : null;
  const average = averageCycle(list.slice(0, -1), settings.cycle_length);
  const inCycle = days.filter((d) => d.day >= prev.start_date && d.day <= end);
  // Как обычно — по циклам до этого (сколько раз в среднем за цикл).
  const before = cycleLengths(list.slice(0, -1)).length;
  const olderDays = days.filter((d) => d.day < prev.start_date);

  const count = (arr: FemDay[], pick: (d: FemDay) => string[]) => {
    const m = new Map<string, number>();
    for (const d of arr) for (const v of pick(d)) m.set(v, (m.get(v) ?? 0) + 1);
    return m;
  };
  const sym = count(inCycle, (d) => d.symptoms.filter((s) => s !== "ok"));
  const symOld = count(olderDays, (d) => d.symptoms.filter((s) => s !== "ok"));
  const moods = inCycle.filter((d) => d.mood);
  const goodShare = moods.length ? moods.filter((d) => GOOD.has(d.mood!)).length / moods.length : null;
  const stress = inCycle.filter((d) => d.tags.includes("o:stress")).length;
  const illness = inCycle.filter((d) => d.tags.includes("o:illness")).length;
  const travel = inCycle.filter((d) => d.tags.includes("o:travel")).length;
  const ec = inCycle.some((d) => d.meds.includes("ec"));
  const lh = inCycle.find((d) => d.lh === "pos" && d.day >= addDays(prev.start_date, 5));
  const temps = inCycle.filter((d) => d.temp != null).map((d) => ({ day: d.day, temp: Number(d.temp) }));
  const shift = temps.length >= 9 ? tempShift(temps, prev.start_date, last.start_date) : null;
  const ovulation = lh ? addDays(lh.day, 1) : shift;
  const health = cycleHealth(list);

  const notes: string[] = [];
  const diff = length - average;
  notes.push(
    Math.abs(diff) <= 1
      ? `Цикл длился ${length} дн. — как обычно.`
      : `Цикл длился ${length} дн. — на ${Math.abs(diff)} дн. ${diff > 0 ? "дольше" : "короче"} вашего среднего (${average}).`,
  );
  if (periodDays) {
    const word = periodDays % 10 === 1 && periodDays !== 11 ? "день" : periodDays % 10 >= 2 && periodDays % 10 <= 4 && (periodDays < 12 || periodDays > 14) ? "дня" : "дней";
    notes.push(`Месячные шли ${periodDays} ${word}${periodDays > 8 ? " — дольше нормы (до 8)." : "."}`);
  }
  if (ovulation) {
    const luteal = daysBetween(ovulation, last.start_date);
    notes.push(
      `Овуляция ${lh ? "по тесту" : "по температуре"} — на ${daysBetween(prev.start_date, ovulation) + 1}-й день; вторая фаза ${luteal} дн.${luteal < 10 ? " — короче обычного (10–16), стоит обсудить с врачом, если повторится." : "."}`,
    );
  }
  const top = [...sym].sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [v, n] of top) {
    const usual = before ? (symOld.get(v) ?? 0) / before : 0;
    notes.push(
      usual && n >= usual * 2 && n >= 2
        ? `${label(v)} — ${times(n)}, обычно около ${Math.max(1, Math.round(usual))}.`
        : `${label(v)} — ${times(n)}.`,
    );
  }
  if (goodShare != null && moods.length >= 4) {
    notes.push(`Хорошее настроение — ${Math.round(goodShare * 100)}% отмеченных дней.`);
  }
  if (stress >= 2 && diff >= 2) notes.push(`В этом цикле стресс отмечен ${times(stress)} — задержка могла быть связана с ним.`);
  else if (stress >= 2) notes.push(`Стресс отмечен ${times(stress)}.`);
  if (illness) notes.push("Была болезнь — она тоже может сдвигать цикл.");
  if (ec) notes.push("Была экстренная контрацепция — она может сдвинуть следующие месячные.");
  const flag = health?.find((h) => !h.ok);
  if (flag) notes.push(`По норме FIGO: ${flag.detail} — стоит показать врачу.`);
  if (notes.length === 1 && Math.abs(diff) <= 1) notes.push("Ровный цикл без отклонений 💗");

  return {
    start: prev.start_date,
    end,
    length,
    periodDays,
    average,
    notes,
    summary: {
      длина_цикла_дней: length,
      средняя_длина_раньше: average,
      длины_последних_циклов: cycleLengths(list).slice(-6),
      месячные_дней: periodDays,
      овуляция_подтверждена: ovulation ? (lh ? "тестом на ЛГ" : "температурой") : "нет",
      день_овуляции: ovulation ? daysBetween(prev.start_date, ovulation) + 1 : null,
      симптомы_за_цикл: Object.fromEntries(top.map(([v, n]) => [label(v), n])),
      симптомы_обычно_за_цикл: Object.fromEntries(top.map(([v]) => [label(v), before ? Math.round(((symOld.get(v) ?? 0) / before) * 10) / 10 : null])),
      доля_хорошего_настроения: goodShare != null ? Math.round(goodShare * 100) : null,
      дней_со_стрессом: stress,
      болезнь: illness > 0,
      путешествие: travel > 0,
      экстренная_контрацепция: ec,
      цель: settings.goal,
      метод_контрацепции: settings.method,
      норма_figo: health?.map((h) => ({ что: h.label, норма: h.ok, детали: h.detail })) ?? null,
    },
  };
}
