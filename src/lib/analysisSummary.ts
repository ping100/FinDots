import { buildSchedule } from "./amortization";
import { isFee } from "./fee";
import type { Wallet } from "./types";

/**
 * Готовые цифры для ИИ-разбора бюджета.
 *
 * Всё, что можно посчитать, считаем здесь: модель плохо складывает и
 * сравнивает, а сырые суммы она пересчитывала по-своему и ошибалась.
 * Ей остаётся объяснить, что значат цифры, — не выводить их.
 *
 * Правила «свободно» и «на день» — те же, что в шапке главного экрана
 * (DailyAllowance): иначе разбор спорил бы с тем, что человек видит.
 */

export type SummaryWallet = Pick<
  Wallet,
  | "id"
  | "kind"
  | "name"
  | "currency"
  | "due_date"
  | "monthly_payment"
  | "is_recurring"
  | "recurring_day"
  | "rate"
  | "goal"
  | "term_end"
  | "amortization_method"
>;

export interface SummaryCategory {
  id: string;
  kind: string;
  name: string;
  monthly_limit: number | null;
  parent_id: string | null;
  planned_amount: number | null;
  due_day: number | null;
  paid_month: string | null;
}

export interface SummaryTx {
  type: string;
  amount: number;
  currency: string;
  category_id: string | null;
  subcategory_id: string | null;
  to_wallet_id: string | null;
  /** У комиссии — id её траты (lib/fee.ts). */
  parent_id?: string | null;
  occurred_at: string;
}

export interface SummaryInput {
  now: Date;
  /** Date.getTimezoneOffset() с устройства человека: сервер живёт в UTC. */
  tzOffset: number;
  base: string;
  toBase: (amount: number, currency: string) => number;
  wallets: SummaryWallet[];
  categories: SummaryCategory[];
  /** Баланс кошелька в его собственной валюте. */
  balanceOf: (walletId: string) => number;
  /** Операции с начала прошлого месяца. */
  transactions: SummaryTx[];
  /** Переводы на кошельки долгов за всё время — сколько уже внесено. */
  debtPayments: SummaryTx[];
}

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export function buildAnalysisSummary(input: SummaryInput) {
  const { tzOffset, base, toBase, wallets, categories, balanceOf, transactions, debtPayments } = input;

  // Местное время человека в виде «UTC-часов»: дальше только getUTC*.
  const local = (d: Date) => new Date(d.getTime() - tzOffset * 60_000);
  const now = local(input.now);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const day = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const daysInPrev = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysLeft = daysInMonth - day + 1;

  const monthStart = Date.UTC(y, m, 1);
  const nextMonth = Date.UTC(y, m + 1, 1);
  const prevStart = Date.UTC(y, m - 1, 1);
  // Тот же отрезок прошлого месяца: 4 октября сравниваем с 1–4 сентября,
  // а не со всем сентябрём — иначе в начале месяца всё «упало на 90%».
  const prevSameEnd = Date.UTC(y, m - 1, Math.min(day, daysInPrev) + 1);
  const thisMonthKey = `${y}-${String(m + 1).padStart(2, "0")}-01`;

  const at = (t: SummaryTx) => local(new Date(t.occurred_at)).getTime();
  const inRange = (t: SummaryTx, from: number, to: number) => {
    const time = at(t);
    return time >= from && time < to;
  };
  const value = (t: SummaryTx) => toBase(Number(t.amount), t.currency);

  const sumBy = (from: number, to: number) => {
    const perCategory = new Map<string, number>();
    const perSub = new Map<string, number>();
    let income = 0;
    let expense = 0;
    let fees = 0;
    for (const t of transactions) {
      if (!inRange(t, from, to)) continue;
      if (t.type === "income") income += value(t);
      if (isFee(t)) fees += value(t);
      if (t.type === "expense") {
        expense += value(t);
        if (t.category_id) add(perCategory, t.category_id, value(t));
        if (t.subcategory_id) add(perSub, t.subcategory_id, value(t));
      }
    }
    return { perCategory, perSub, income, expense, fees };
  };

  const cur = sumBy(monthStart, nextMonth);
  const prevSame = sumBy(prevStart, prevSameEnd);
  const prevFull = sumBy(prevStart, monthStart);

  const shareOf = (amount: number) =>
    cur.expense > 0 ? Math.round((amount / cur.expense) * 100) : null;

  const expenseCats = categories.filter((c) => c.kind === "expense" && !c.parent_id);
  const bills = expenseCats.filter((c) => c.planned_amount);
  const variable = expenseCats.filter((c) => !c.planned_amount);

  // ── регулярные платежи ──
  const billRows = bills.map((c) => {
    const planned = Number(c.planned_amount);
    const spent = cur.perCategory.get(c.id) ?? 0;
    const marked = c.paid_month === thisMonthKey;
    const left = marked ? 0 : Math.max(planned - spent, 0);
    return {
      название: c.name,
      в_месяц: round(planned),
      оплачено_тратами: round(spent),
      доля_от_всех_трат_процентов: shareOf(spent),
      отмечено_оплаченным_вручную: marked,
      осталось_оплатить: round(left),
      число_платежа: c.due_day,
      просрочен: left > 0.5 && c.due_day != null && c.due_day < day,
    };
  });

  // ── кошельки, накопления, долги ──
  const ofKind = (kind: string) => wallets.filter((w) => w.kind === kind);
  const inBase = (w: SummaryWallet) => toBase(balanceOf(w.id), w.currency);
  const total = (list: SummaryWallet[]) => list.reduce((s, w) => s + inBase(w), 0);

  const money = total([...ofKind("cash"), ...ofKind("card")]);
  const saved = total(ofKind("savings"));
  const owed = total(ofKind("debt_out"));
  const owedToMe = total(ofKind("debt_in"));

  const paidIntoThisMonth = (walletId: string) =>
    transactions
      .filter((t) => t.type === "transfer" && t.to_wallet_id === walletId && inRange(t, monthStart, nextMonth))
      .reduce((s, t) => s + value(t), 0);
  const paidIntoEver = (w: SummaryWallet) =>
    debtPayments
      .filter((t) => t.to_wallet_id === w.id)
      .reduce((s, t) => s + value(t), 0);

  // Обязательства до конца месяца — как в шапке главного экрана.
  const upcoming: { название: string; сумма: number }[] = [];
  for (const w of ofKind("debt_out")) {
    if (w.is_recurring && w.recurring_day != null && w.monthly_payment) {
      if (w.recurring_day >= day) {
        const left = toBase(w.monthly_payment, w.currency) - paidIntoThisMonth(w.id);
        if (left > 0.5) upcoming.push({ название: w.name, сумма: round(left) });
      }
      continue;
    }
    if (w.due_date) {
      const due = Date.parse(`${w.due_date}T00:00:00Z`);
      if (due >= Date.UTC(y, m, day) && due < nextMonth) {
        const left = inBase(w);
        if (left > 0) upcoming.push({ название: w.name, сумма: round(left) });
      }
    }
  }
  for (const row of billRows) {
    if (row.осталось_оплатить > 0.5) upcoming.push({ название: row.название, сумма: row.осталось_оплатить });
  }
  const obligations = upcoming.reduce((s, u) => s + u.сумма, 0);
  const free = money - obligations;

  const savedThisMonth = transactions
    .filter(
      (t) =>
        (t.type === "transfer" || t.type === "allocation") &&
        inRange(t, monthStart, nextMonth) &&
        ofKind("savings").some((w) => w.id === t.to_wallet_id),
    )
    .reduce((s, t) => s + value(t), 0);

  const variableSpent = variable.reduce((s, c) => s + (cur.perCategory.get(c.id) ?? 0), 0);
  const variablePrevFull = variable.reduce((s, c) => s + (prevFull.perCategory.get(c.id) ?? 0), 0);
  const pacePerDay = variableSpent / day;

  // ── траты по категориям, только «живые» ──
  const categoryRows = variable
    .map((c) => {
      const spent = cur.perCategory.get(c.id) ?? 0;
      const sameBefore = prevSame.perCategory.get(c.id) ?? 0;
      const fullBefore = prevFull.perCategory.get(c.id) ?? 0;
      const limit = c.monthly_limit ? Number(c.monthly_limit) : null;
      return {
        категория: c.name,
        потрачено: round(spent),
        доля_от_всех_трат_процентов: shareOf(spent),
        за_те_же_дни_прошлого_месяца: round(sameBefore),
        изменение_процентов: sameBefore > 0 ? Math.round(((spent - sameBefore) / sameBefore) * 100) : null,
        за_весь_прошлый_месяц: round(fullBefore),
        лимит: limit,
        лимит_израсходован_процентов: limit ? Math.round((spent / limit) * 100) : null,
        уточнения: categories
          .filter((s) => s.parent_id === c.id && (cur.perSub.get(s.id) ?? 0) > 0)
          .map((s) => ({ название: s.name, сумма: round(cur.perSub.get(s.id) ?? 0) })),
      };
    })
    .filter((r) => r.потрачено > 0 || r.за_весь_прошлый_месяц > 0 || r.лимит)
    .sort((a, b) => b.потрачено - a.потрачено);

  // ── долги: остаток, ставка и во что обойдутся ──
  const debts = ofKind("debt_out")
    .map((w) => {
      const remaining = balanceOf(w.id);
      const schedule = w.rate ? buildSchedule(w as Wallet, remaining) : null;
      const overpay = schedule?.reduce((s, r) => s + r.interest, 0) ?? null;
      return {
        название: w.name,
        кредит_с_ежемесячным_платежом: !!w.monthly_payment,
        остаток: round(toBase(remaining, w.currency)),
        платёж_в_месяц: w.monthly_payment ? round(toBase(w.monthly_payment, w.currency)) : null,
        число_платежа: w.recurring_day,
        ставка_годовых: w.rate,
        тип_графика: w.monthly_payment
          ? w.amortization_method === "equal"
            ? "равными долями"
            : "аннуитет"
          : null,
        погасить_до: w.due_date,
        уже_внесено_всего: round(paidIntoEver(w)),
        месяцев_до_погашения: schedule?.length ?? null,
        переплата_процентами_до_конца: overpay != null ? round(toBase(overpay, w.currency)) : null,
        проценты_в_ближайшем_платеже: schedule?.[0] ? round(toBase(schedule[0].interest, w.currency)) : null,
      };
    })
    .filter((d) => d.остаток > 0.5);

  return {
    валюта: base,
    сегодня: {
      дата: `${day} ${MONTHS[m]} ${y}`,
      день_месяца: day,
      дней_в_месяце: daysInMonth,
      осталось_дней_включая_сегодня: daysLeft,
      месяц_только_начался: day <= 7,
    },
    итоги_месяца: {
      доход: round(cur.income),
      траты_всего: round(cur.expense),
      траты_за_те_же_дни_прошлого_месяца: round(prevSame.expense),
      изменение_трат_к_тем_же_дням_процентов:
        prevSame.expense > 0 ? Math.round(((cur.expense - prevSame.expense) / prevSame.expense) * 100) : null,
      // Входят в траты_всего, но ни в одну категорию — общей суммой.
      комиссии: round(cur.fees),
      комиссии_за_весь_прошлый_месяц: round(prevFull.fees),
      доход_минус_траты: round(cur.income - cur.expense),
      траты_в_процентах_от_дохода: cur.income > 0 ? Math.round((cur.expense / cur.income) * 100) : null,
      отложено_в_накопления: round(savedThisMonth),
      переменные_траты: round(variableSpent),
      переменные_траты_в_среднем_в_день: round(pacePerDay),
      прогноз_переменных_трат_на_весь_месяц: round(pacePerDay * daysInMonth),
    },
    прошлый_месяц: {
      доход_за_те_же_дни: round(prevSame.income),
      траты_за_те_же_дни: round(prevSame.expense),
      доход_за_весь_месяц: round(prevFull.income),
      траты_за_весь_месяц: round(prevFull.expense),
      переменные_траты_за_весь_месяц: round(variablePrevFull),
    },
    деньги_сейчас: {
      свободно_в_кошельках: round(money),
      в_накоплениях: round(saved),
      я_должен_всего: round(owed),
      мне_должны_всего: round(owedToMe),
    },
    до_конца_месяца: {
      обязательные_платежи_впереди: upcoming,
      обязательных_всего: round(obligations),
      хватает_на_обязательные: free >= 0,
      не_хватает: free < 0 ? round(-free) : 0,
      можно_тратить_в_день: free > 0 ? round(free / Math.max(daysLeft, 1)) : 0,
    },
    каждый_месяц: billRows,
    траты_по_категориям: categoryRows,
    кошельки: [...ofKind("cash"), ...ofKind("card")].map((w) => ({ название: w.name, баланс: round(inBase(w)) })),
    накопления: ofKind("savings").map((w) => {
      const balance = inBase(w);
      return {
        название: w.name,
        баланс: round(balance),
        ставка_годовых: w.rate,
        примерно_приносит_в_месяц: w.rate ? round((balance * w.rate) / 100 / 12) : null,
        цель: w.goal,
        до_цели: w.goal ? round(Math.max(toBase(w.goal, w.currency) - balance, 0)) : null,
        конец_срока: w.term_end,
      };
    }),
    я_должен: debts,
    мне_должны: ofKind("debt_in")
      .filter((w) => balanceOf(w.id) > 0.5)
      .map((w) => ({ название: w.name, остаток: round(inBase(w)), вернуть_до: w.due_date })),
  };
}

function add(map: Map<string, number>, key: string, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
