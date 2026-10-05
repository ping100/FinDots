import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPush } from "@/lib/push";
import { sameSecret } from "@/lib/serverSecret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Разослать напоминания, которым пришло время: о задачах (Todots) и о
 * регулярных платежах из «Каждый месяц» (Findots, за два дня до числа).
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

  const [tasksRes, billsRes] = await Promise.all([
    supabase.rpc("claim_due_reminders", { p_secret: secret }),
    supabase.rpc("claim_due_bill_reminders", { p_secret: secret }),
  ]);
  if (tasksRes.error) return NextResponse.json({ error: tasksRes.error.message }, { status: 500 });
  if (billsRes.error) return NextResponse.json({ error: billsRes.error.message }, { status: 500 });

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

  const messages = [
    ...tasks.map((row) => ({
      sub: row,
      push: { title: "Напоминание", body: row.title, url: "/tasks", tag: `task-${row.task_id}` },
    })),
    ...bills.map((row) => ({
      sub: row,
      push: {
        title: "Скоро платёж",
        body: `${row.name} — ${money(Number(row.amount), row.currency)}, ${whenDue(row.days_left, row.due)}`,
        url: "/money",
        tag: `bill-${row.category_id}-${row.due}`,
      },
    })),
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
