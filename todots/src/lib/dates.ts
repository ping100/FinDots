const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
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

/** Полоса дат для ленты: centered ± span дней. */
export function dateRange(center: string, span: number): string[] {
  const out: string[] = [];
  for (let i = -span; i <= span; i++) out.push(addDays(center, i));
  return out;
}
