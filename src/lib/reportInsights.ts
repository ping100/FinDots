import { isFee } from "./fee";
import { monthRange } from "./money";
import type { Category, CurrencyCode, Transaction } from "./types";

/**
 * Выводы для «Отчёта»: обычный месяц, частые покупки, дни недели,
 * крупные и регулярные траты. Всё считается на клиенте из тех же операций,
 * что и остальной отчёт, — отдельных таблиц не нужно.
 *
 * «Обычный месяц» — среднее по последним шести месяцам, в которых вообще
 * были записи: месяцы до начала пользования приложением среднее не тянут
 * вниз. Для текущего месяца сравниваем «на ту же дату»: 14 октября — с
 * тратами за 1–14 число прошлых месяцев, а не с целыми месяцами.
 */

type ToBase = (amount: number, currency: CurrencyCode) => number;

export interface InsightItem {
  key: string;
  name: string;
  caption: string;
  amount: number;
  icon: string;
  color: string;
}

export interface Insights {
  /** Текущий месяц — число, по которое считаем; прошлый — null (весь месяц). */
  cutoff: number | null;
  /** Сколько дней месяца учтено: до сегодня или весь месяц. */
  days: number;
  spent: number;
  earned: number;
  usual: { month: number; toDate: number; income: number; months: number } | null;
  noSpend: { days: number; prev: number | null; prevMonth: string | null };
  months: { key: string; label: string; value: number; selected: boolean; partial: boolean }[];
  frequent: (InsightItem & { count: number; avg: number })[];
  biggest: InsightItem[];
  regular: InsightItem[];
  weekdays: { label: string; avg: number }[] | null;
  /** Категория, выросшая сильнее всех к обычному месяцу. */
  /** delta — доля роста; null — раньше на это почти не тратили (новая статья). */
  rise: { name: string; now: number; usual: number; delta: number | null } | null;
  priciestDay: { day: number; amount: number; category: string | null } | null;
}

const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
/** «в сентябре было 5» — месяц в предложном падеже. */
export const MONTH_IN = [
  "январе", "феврале", "марте", "апреле", "мае", "июне",
  "июле", "августе", "сентябре", "октябре", "ноябре", "декабре",
];

/** Слова, с которых банк начинает строку выписки, — не часть названия. */
const OPERATION = /^(покупка|оплата|перевод|платёж|платеж|снятие|разное)\s+/i;

/** «Покупка MAGNUM CASH&CARRY 12» → ключ «magnum cash&carry» и имя для экрана. */
export function merchantOf(note: string | null): { key: string; name: string } | null {
  if (!note) return null;
  let name = note
    .replace(OPERATION, "")
    // Хвост из номеров магазина и терминала: «MAGNUM 12», «KFC №3».
    .replace(/(\s+[№#]?\d[\d-]*)+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  // Выписки печатают капслоком — «MAGNUM CASH&CARRY» читается как крик.
  if (name.length > 3 && name === name.toUpperCase()) {
    name = name.toLowerCase().replace(/(^|[\s&-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  }
  const key = name
    .toLowerCase()
    .replace(/[\d№#*]+/g, " ")
    .replace(/[^\p{L}&\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
  if (key.length < 2) return null;
  const pretty = name.length > 26 ? `${name.slice(0, 25)}…` : name;
  return { key, name: pretty.charAt(0).toUpperCase() + pretty.slice(1) };
}

function dateLabel(at: Date): string {
  return at.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function buildInsights(
  transactions: Transaction[],
  categories: Category[],
  offset: number,
  toBase: ToBase,
): Insights {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const now = new Date();
  const { from, to } = monthRange(offset);
  const daysInMonth = new Date(to.getTime() - 1).getDate();
  const cutoff = offset === 0 ? now.getDate() : null;
  const days = cutoff ?? daysInMonth;

  const main = (t: Transaction) => {
    const c = t.category_id ? byId.get(t.category_id) : undefined;
    // Траты пишутся в главную категорию, но на всякий случай поднимаемся к ней.
    return c?.parent_id ? byId.get(c.parent_id) ?? c : c;
  };
  const value = (t: Transaction) => toBase(Number(t.amount), t.currency);

  // Операции по месяцам (сдвиг → список), чтобы не фильтровать по кругу.
  const monthOf = (at: Date) => (at.getFullYear() - now.getFullYear()) * 12 + at.getMonth() - now.getMonth();
  const byMonth = new Map<number, Transaction[]>();
  for (const t of transactions) {
    const shift = monthOf(new Date(t.occurred_at));
    if (shift > offset || shift < offset - 6) continue;
    const list = byMonth.get(shift) ?? [];
    list.push(t);
    byMonth.set(shift, list);
  }
  const expenses = (shift: number, upTo?: number) =>
    (byMonth.get(shift) ?? []).filter(
      (t) => t.type === "expense" && (upTo == null || new Date(t.occurred_at).getDate() <= upTo),
    );
  const sum = (list: Transaction[]) => list.reduce((s, t) => s + value(t), 0);

  const current = expenses(offset, cutoff ?? undefined);
  const spent = sum(current);
  const earned = sum((byMonth.get(offset) ?? []).filter((t) => t.type === "income"));

  // ── обычный месяц ──
  const history: { shift: number; month: number; toDate: number; income: number }[] = [];
  for (let k = 1; k <= 6; k++) {
    const shift = offset - k;
    const list = byMonth.get(shift) ?? [];
    if (!list.length) continue;
    history.push({
      shift,
      month: sum(expenses(shift)),
      toDate: sum(expenses(shift, days)),
      income: sum(list.filter((t) => t.type === "income")),
    });
  }
  const mean = (pick: (h: (typeof history)[number]) => number) =>
    history.reduce((s, h) => s + pick(h), 0) / history.length;
  const usual = history.length
    ? { month: mean((h) => h.month), toDate: mean((h) => h.toDate), income: mean((h) => h.income), months: history.length }
    : null;

  // ── траты по дням: дни без трат и самый дорогой день ──
  const perDay = (list: Transaction[], n: number) => {
    const out = new Array<number>(n).fill(0);
    for (const t of list) {
      const d = new Date(t.occurred_at).getDate();
      if (d <= n) out[d - 1] += value(t);
    }
    return out;
  };
  const daily = perDay(current, days);
  const prevList = byMonth.get(offset - 1);
  const prevStart = monthRange(offset - 1).from;
  const prevDays = Math.min(days, new Date(from.getTime() - 1).getDate());
  const noSpend = {
    days: daily.filter((v) => v === 0).length,
    prev: prevList?.length ? perDay(expenses(offset - 1), prevDays).filter((v) => v === 0).length : null,
    prevMonth: prevList?.length ? MONTH_IN[prevStart.getMonth()] : null,
  };
  let priciestDay: Insights["priciestDay"] = null;
  daily.forEach((amount, i) => {
    if (amount > 0 && (!priciestDay || amount > priciestDay.amount)) priciestDay = { day: i + 1, amount, category: null };
  });
  if (priciestDay) {
    const day = (priciestDay as { day: number }).day;
    const top = new Map<string, number>();
    for (const t of current) {
      if (new Date(t.occurred_at).getDate() !== day) continue;
      const c = main(t);
      if (c) top.set(c.name, (top.get(c.name) ?? 0) + value(t));
    }
    const best = [...top.entries()].sort((a, b) => b[1] - a[1])[0];
    (priciestDay as { category: string | null }).category = best?.[0] ?? null;
  }

  // ── по месяцам: полгода по выбранный ──
  const months: Insights["months"] = [];
  for (let k = 5; k >= 0; k--) {
    const shift = offset - k;
    const start = monthRange(shift).from;
    months.push({
      key: String(shift),
      label: SHORT[start.getMonth()],
      value: sum(expenses(shift)),
      selected: k === 0,
      partial: shift === 0,
    });
  }

  // ── частые покупки ──
  // Магазин из примечания — если он встречается хотя бы дважды; иначе трата
  // уходит в своё уточнение или категорию: «кофе с Машей» и «кофе у дома»
  // по отдельности ничего не скажут, а «Кафе — 14 раз» скажет.
  const own = current.filter((t) => !isFee(t) && t.category_id);
  const noteCount = new Map<string, number>();
  for (const t of own) {
    const m = merchantOf(t.note);
    if (m) noteCount.set(m.key, (noteCount.get(m.key) ?? 0) + 1);
  }
  const groups = new Map<string, { name: string; count: number; total: number; cat: Category | undefined }>();
  for (const t of own) {
    const m = merchantOf(t.note);
    const c = main(t);
    const sub = t.subcategory_id ? byId.get(t.subcategory_id) : undefined;
    const [key, name] =
      m && (noteCount.get(m.key) ?? 0) >= 2
        ? [`m:${m.key}`, m.name]
        : sub
          ? [`s:${sub.id}`, sub.name]
          : [`c:${c?.id}`, c?.name ?? "Без категории"];
    const g = groups.get(key) ?? { name, count: 0, total: 0, cat: c };
    g.count += 1;
    g.total += value(t);
    groups.set(key, g);
  }
  const frequent = [...groups.entries()]
    .filter(([, g]) => g.count >= 2)
    .sort((a, b) => b[1].count - a[1].count || b[1].total - a[1].total)
    .slice(0, 4)
    .map(([key, g]) => ({
      key,
      name: g.name,
      caption: "",
      count: g.count,
      avg: g.total / g.count,
      amount: g.total,
      icon: g.cat?.icon ?? "tag",
      color: g.cat?.color ?? "#94a3b8",
    }));

  // ── крупные траты ──
  const biggest = [...own]
    .sort((a, b) => value(b) - value(a))
    .slice(0, 3)
    .map((t) => {
      const c = main(t);
      const sub = t.subcategory_id ? byId.get(t.subcategory_id) : undefined;
      const name = merchantOf(t.note)?.name ?? sub?.name ?? c?.name ?? "Трата";
      return {
        key: t.id,
        name,
        caption: [dateLabel(new Date(t.occurred_at)), name !== c?.name ? c?.name : null].filter(Boolean).join(" · "),
        amount: value(t),
        icon: c?.icon ?? "tag",
        color: c?.color ?? "#94a3b8",
      };
    });

  // ── регулярные платежи ──
  // Явные — категории «Каждый месяц» с плановой суммой. Найденные — магазин
  // из примечания, который был в каждом из трёх прошлых месяцев примерно
  // на одну и ту же сумму (±15%): подписка, интернет, связь.
  const regular: InsightItem[] = categories
    .filter((c) => !c.archived && c.kind === "expense" && c.planned_amount)
    .map((c) => ({
      key: c.id,
      name: c.name,
      caption: c.due_day ? `каждое ${c.due_day}-е число` : "каждый месяц",
      amount: Number(c.planned_amount),
      icon: c.icon,
      color: c.color,
    }));
  const planned = new Set(regular.map((r) => r.key));
  const seen = new Map<string, { name: string; amounts: number[]; days: number[]; months: Set<number>; cat?: Category }>();
  for (let k = 1; k <= 3; k++) {
    for (const t of expenses(offset - k)) {
      const m = merchantOf(t.note);
      const c = main(t);
      if (!m || isFee(t) || (c && planned.has(c.id))) continue;
      const s = seen.get(m.key) ?? { name: m.name, amounts: [], days: [], months: new Set<number>(), cat: c };
      s.amounts.push(value(t));
      s.days.push(new Date(t.occurred_at).getDate());
      s.months.add(k);
      seen.set(m.key, s);
    }
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  for (const [key, s] of seen) {
    // Ровно раз в месяц: три месяца — три платежа, иначе это частая покупка.
    if (s.months.size < 3 || s.amounts.length !== 3) continue;
    const mid = median(s.amounts);
    if (s.amounts.some((a) => Math.abs(a - mid) > mid * 0.15)) continue;
    regular.push({
      key: `m:${key}`,
      name: s.name,
      caption: `около ${median(s.days)}-го числа`,
      amount: mid,
      icon: s.cat?.icon ?? "repeat",
      color: s.cat?.color ?? "#94a3b8",
    });
  }

  // ── дни недели: три месяца по выбранный, чтобы один поход в магазин не решал ──
  const weekStart = monthRange(offset - 2).from;
  const weekEnd = cutoff ? new Date(now.getFullYear(), now.getMonth(), cutoff + 1) : to;
  const wSum = new Array<number>(7).fill(0);
  const wCount = new Array<number>(7).fill(0);
  let firstSeen: Date | null = null;
  for (let k = 0; k <= 2; k++) {
    for (const t of expenses(offset - k)) {
      const at = new Date(t.occurred_at);
      if (at < weekStart || at >= weekEnd) continue;
      if (!firstSeen || at < firstSeen) firstSeen = at;
      wSum[(at.getDay() + 6) % 7] += value(t);
    }
  }
  // Дни считаем с первой записи: недели до начала пользования — не «нулевые траты».
  if (firstSeen) {
    const start = new Date(Math.max(weekStart.getTime(), new Date(firstSeen as Date).setHours(0, 0, 0, 0)));
    for (let d = new Date(start); d < weekEnd; d.setDate(d.getDate() + 1)) wCount[(d.getDay() + 6) % 7] += 1;
  }
  const weekdays = wCount.every((n) => n > 0) && wSum.some((v) => v > 0)
    ? WEEK.map((label, i) => ({ label, avg: wSum[i] / wCount[i] }))
    : null;

  // ── что выросло сильнее всего ──
  let rise: Insights["rise"] = null;
  if (usual) {
    const nowBy = new Map<string, number>();
    for (const t of own) {
      const c = main(t);
      if (c) nowBy.set(c.id, (nowBy.get(c.id) ?? 0) + value(t));
    }
    const usualBy = new Map<string, number>();
    for (const h of history) {
      for (const t of expenses(h.shift, days)) {
        const c = main(t);
        if (c && !isFee(t)) usualBy.set(c.id, (usualBy.get(c.id) ?? 0) + value(t) / history.length);
      }
    }
    // Мерило «заметно» — от трат месяца: обычные траты к этой дате могут
    // быть нулём (в прошлые месяцы к этому числу ничего не тратили).
    const ref = Math.max(usual.toDate, spent);
    for (const [id, amount] of nowBy) {
      const base = usualBy.get(id) ?? 0;
      // Мелочь не в счёт: «+300%» на 500 ₸ ничего не значит.
      if (ref <= 0 || amount - base < ref * 0.05) continue;
      // Почти ноль в прошлом — процент бессмыслен (деление на ноль даёт
      // «Infinity%»), это просто новая статья расходов.
      const delta = base < ref * 0.02 ? null : (amount - base) / base;
      if (delta != null && delta < 0.15) continue;
      if (!rise || amount - base > rise.now - rise.usual) {
        rise = { name: byId.get(id)?.name ?? "", now: amount, usual: base, delta };
      }
    }
  }

  return { cutoff, days, spent, earned, usual, noSpend, months, frequent, biggest, regular, weekdays, rise, priciestDay };
}
