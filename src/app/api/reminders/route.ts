import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPush } from "@/lib/push";
import { sameSecret } from "@/lib/serverSecret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Разослать напоминания, которым пришло время: о задачах (Todots) и о
 * регулярных платежах из «Каждый месяц» (Findots, за два дня до числа),
 * о воде и о сне («Здоровье» в Todots), утренняя сводка задач.
 *
 * Зовёт сама база (pg_cron раз в минуту, и только когда есть что
 * отправить) с секретом из Vault. Вход здесь не нужен и не используется:
 * напоминания забираются функцией базы, которая сверяет тот же секрет и
 * отдаёт только подписки и заголовки задач, которым пора.
 */
export async function POST(request: Request) {
  const secret = process.env.REMINDERS_SECRET ?? "";
  const given = request.headers.get("x-reminders-secret") ?? "";
  if (!sameSecret(given, secret)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

  const [tasksRes, billsRes, wellnessRes, summaryRes, femRes] = await Promise.all([
    supabase.rpc("claim_due_reminders", { p_secret: secret }),
    supabase.rpc("claim_due_bill_reminders", { p_secret: secret }),
    supabase.rpc("claim_due_wellness_reminders", { p_secret: secret }),
    supabase.rpc("claim_due_task_summaries", { p_secret: secret }),
    supabase.rpc("claim_due_fem_reminders", { p_secret: secret }),
  ]);
  // Рассылки независимы: сбой в напоминаниях о платежах не должен
  // оставить без напоминаний задачи — и наоборот.
  const failures = [tasksRes.error, billsRes.error, wellnessRes.error, summaryRes.error, femRes.error].filter(Boolean);
  if (failures.length === 5) {
    return NextResponse.json({ error: failures.map((e) => e!.message).join("; ") }, { status: 500 });
  }

  const tasks = (tasksRes.data ?? []) as { endpoint: string; p256dh: string; auth: string; title: string; task_id: string }[];
  const bills = (billsRes.data ?? []) as {
    endpoint: string;
    p256dh: string;
    auth: string;
    category_id: string;
    name: string;
    amount: number;
    currency: string;
    due: string;
    days_left: number;
  }[];

  const wellness = (wellnessRes.data ?? []) as {
    endpoint: string;
    p256dh: string;
    auth: string;
    kind: "water" | "sleep_prep" | "sleep";
    glasses: number;
    goal: number;
    prep_min: number;
  }[];

  const summaries = (summaryRes.data ?? []) as {
    endpoint: string;
    p256dh: string;
    auth: string;
    total: number;
    overdue: number;
    first_title: string | null;
    first_time: string | null;
  }[];

  const fem = (femRes.data ?? []) as {
    endpoint: string;
    p256dh: string;
    auth: string;
    kind: "period" | "fertile" | "pill";
    mark: string;
    days_left: number;
    until_day: string | null;
    discreet: boolean;
  }[];

  const messages = [
    ...tasks.map((row) => ({
      sub: row,
      push: { title: `📌 ${row.title}`, body: "Время пришло — отметьте, когда сделаете", url: "/tasks", tag: `task-${row.task_id}` },
    })),
    ...bills.map((row) => ({
      sub: row,
      push: {
        title: "💳 Скоро платёж",
        body: `${row.name} — ${money(Number(row.amount), row.currency)}, ${whenDue(row.days_left, row.due)}`,
        url: "/money",
        tag: `bill-${row.category_id}-${row.due}`,
      },
    })),
    ...wellness.map((row) => ({ sub: row, push: wellnessPush(row) })),
    ...summaries.map((row) => ({ sub: row, push: summaryPush(row) })),
    ...fem.map((row) => ({ sub: row, push: femPush(row) })),
  ];

  const results = await Promise.all(
    messages.map(async ({ sub, push }) => {
      const result = await sendPush(sub, push);
      if (result === "dead") {
        await supabase.rpc("drop_push_subscription", { p_secret: secret, p_endpoint: sub.endpoint });
      }
      return result;
    }),
  );

  return NextResponse.json({
    errors: failures.map((e) => e!.message),
    sent: results.filter((r) => r === "ok").length,
    dead: results.filter((r) => r === "dead").length,
    failed: results.filter((r) => r === "failed").length,
  });
}

/** «сегодня», «завтра» или «27 октября». */
function whenDue(daysLeft: number, due: string): string {
  if (daysLeft <= 0) return "сегодня";
  if (daysLeft === 1) return "завтра";
  return new Date(`${due}T12:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
}

/**
 * «2 890 ₸». Свой форматтер: lib/money тянет за собой клиентский React
 * (useSyncExternalStore для «глазка»), а это серверный маршрут.
 */
function money(amount: number, currency: string): string {
  const symbol = ({ KZT: "₸", RUB: "₽", USD: "$" } as Record<string, string>)[currency] ?? currency;
  const rounded = Math.round(amount * 100) / 100;
  const digits = Number.isInteger(rounded) ? 0 : 2;
  return `${rounded.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${symbol}`;
}

/**
 * Текст напоминаний «Здоровья». Тег один на вид: новое заменяет старое, не
 * копится. Стаканы рисуем капельками — прогресс виден, не читая цифр.
 */
function wellnessPush(row: { kind: "water" | "sleep_prep" | "sleep"; glasses: number; goal: number; prep_min: number }) {
  if (row.kind === "water") {
    const left = Math.max(row.goal - row.glasses, 0);
    return {
      title: "💧 Пора выпить воды",
      body:
        row.glasses > 0
          ? `${drops(row.glasses, row.goal)}  ${row.glasses} из ${row.goal} — осталось ${left} ${plural(left, "стакан", "стакана", "стаканов")}`
          : `Начните со стакана воды — цель на сегодня ${row.goal} ${plural(row.goal, "стакан", "стакана", "стаканов")}`,
      url: "/tasks",
      tag: "water",
    };
  }
  if (row.kind === "sleep_prep") {
    return {
      title: "🌙 Скоро спать",
      body: `Через ${row.prep_min} мин — отбой. Самое время отложить телефон`,
      url: "/tasks",
      tag: "sleep",
    };
  }
  return { title: "😴 Пора спать", body: "Спокойной ночи! Задачи подождут до утра", url: "/tasks", tag: "sleep" };
}

/** «💧💧💧○○○»: до 10 делений, дальше — пропорционально. */
function drops(glasses: number, goal: number): string {
  const total = Math.min(goal, 10);
  const filled = goal <= 10 ? Math.min(glasses, goal) : Math.round((glasses / goal) * 10);
  return "💧".repeat(filled) + "○".repeat(Math.max(total - filled, 0));
}

/** «Доброе утро! Сегодня 5 задач» — «Первая в 10:00 — Позвонить в банк. Пропущено: 2». */
function summaryPush(row: { total: number; overdue: number; first_title: string | null; first_time: string | null }) {
  const parts: string[] = [];
  if (row.first_title && row.first_time) parts.push(`Первая в ${row.first_time.slice(0, 5)} — ${row.first_title}`);
  if (row.overdue > 0) parts.push(`Пропущено: ${row.overdue}`);
  return {
    title:
      row.total > 0
        ? `☀️ Доброе утро! Сегодня ${row.total} ${plural(row.total, "задача", "задачи", "задач")}`
        : "☀️ Доброе утро! На сегодня задач нет",
    body: parts.length ? parts.join(". ") : row.total > 0 ? "Хорошего дня!" : "Свободный день — можно что-то запланировать",
    url: "/tasks",
    tag: "summary",
  };
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «14 октября» из «2026-10-14». */
function dayLong(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
}

/**
 * FemDots. В скрытом режиме на экране блокировки — ни слова о цикле:
 * телефон могут увидеть другие.
 */
function femPush(row: { kind: "period" | "fertile" | "pill"; mark: string; days_left: number; until_day: string | null; discreet: boolean }) {
  const tag = `fem-${row.kind}`;
  if (row.discreet) {
    return {
      title: row.kind === "pill" ? "🌸 FemDots: напоминание" : "🌸 FemDots",
      body: "Загляните в календарь",
      url: "/fem",
      tag,
    };
  }
  if (row.kind === "period") {
    const when = row.days_left <= 0 ? "сегодня" : row.days_left === 1 ? "завтра" : `через ${row.days_left} дня`;
    return {
      title: "🌸 Скоро месячные",
      body: `Ожидаются ${when} — около ${dayLong(row.mark)}. Возьмите с собой всё нужное`,
      url: "/fem",
      tag,
    };
  }
  if (row.kind === "fertile") {
    return {
      title: "🌿 Началось фертильное окно",
      body: row.until_day ? `Примерно до ${dayLong(row.until_day)} — самые высокие шансы забеременеть` : "Самые высокие шансы забеременеть",
      url: "/fem",
      tag,
    };
  }
  return { title: "💊 Время таблетки", body: "Не забудьте принять таблетку", url: "/fem", tag };
}
