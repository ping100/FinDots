import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Разослать напоминания, которым пришло время.
 *
 * Зовёт сама база (pg_cron раз в минуту, и только когда есть что
 * отправить) с секретом из Vault. Вход здесь не нужен и не используется:
 * напоминания забираются функцией базы, которая сверяет тот же секрет и
 * отдаёт только подписки и заголовки задач, которым пора.
 */
export async function POST(request: Request) {
  const secret = process.env.REMINDERS_SECRET ?? "";
  const given = request.headers.get("x-reminders-secret") ?? "";
  if (!secret || !same(given, secret)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("claim_due_reminders", { p_secret: secret });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as { endpoint: string; p256dh: string; auth: string; title: string; task_id: string }[];
  const results = await Promise.all(
    rows.map(async (row) => {
      const result = await sendPush(row, {
        title: "Напоминание",
        body: row.title,
        url: "/tasks",
        tag: `task-${row.task_id}`,
      });
      if (result === "dead") {
        await supabase.rpc("drop_push_subscription", { p_secret: secret, p_endpoint: row.endpoint });
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

/** Сравнение без утечки по времени ответа. */
function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
