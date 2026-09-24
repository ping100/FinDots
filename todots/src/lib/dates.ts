const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
/** Заголовки календаря: неделя у нас начинается с понедельника. */
export const WEEKDAY_HEADS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const MONTHS_NOM = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

/** Локальная дата, а не UTC — иначе после полуночи по местному времени
    задача рисуется во вчерашнем дне. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + n);
  return toISODate(date);
}

export function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

export function dayNumber(iso: string): number {
  return Number(iso.split("-")[2]);
}

/** «Сегодня», «Завтра», «Вчера» — либо «5 октября». Год показываем, только
    если дата не в этом году: он почти никогда не нужен. */
export function dayLabel(iso: string): string {
  const t = today();
  if (iso === t) return "Сегодня";
  if (iso === addDays(t, 1)) return "Завтра";
  if (iso === addDays(t, -1)) return "Вчера";
  const [y, m, d] = iso.split("-").map(Number);
  const suffix = y === new Date().getFullYear() ? "" : ` ${y}`;
  return `${d} ${MONTHS[m - 1]}${suffix}`;
}

/** Понедельник той недели, в которую попадает дата. */
export function startOfWeek(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // getDay(): 0 — воскресенье, у нас это конец недели, а не начало.
  const shift = (date.getDay() + 6) % 7;
  return addDays(iso, -shift);
}

/** Семь дней недели, с понедельника. */
export function weekDays(iso: string): string[] {
  const start = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function addWeeks(iso: string, n: number): string {
  return addDays(iso, n * 7);
}

export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  // День фиксируем первым числом: иначе 31 января + 1 месяц уезжает в март.
  const date = new Date(y, m - 1 + n, 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(d, lastDay));
  return toISODate(date);
}

/** Сетка месяца, добитая до целых недель — в ней всегда 7 колонок. */
export function monthGrid(iso: string): string[] {
  const [y, m] = iso.split("-").map(Number);
  const first = toISODate(new Date(y, m - 1, 1));
  const last = toISODate(new Date(y, m, 0));
  const out: string[] = [];
  let day = startOfWeek(first);
  // Идём до конца месяца и дальше, пока не доберём последнюю неделю целиком.
  while (day <= last || out.length % 7 !== 0) {
    out.push(day);
    day = addDays(day, 1);
  }
  return out;
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** «Сентябрь 2026» — заголовок календаря. */
export function monthTitle(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS_NOM[m - 1]} ${y}`;
}
