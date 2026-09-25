import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPush } from "@/lib/push";
import { sameSecret } from "@/lib/serverSecret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Пуш на ответ администратора.
 *
 * Зовёт сама база — триггером на новое сообщение в support_messages, сразу
 * после вставки, с секретом из Vault. Вход здесь не нужен: подписки и текст
 * ответа отдаёт функция базы, которая сверяет тот же секрет и достаёт
 * только то, что относится к одному конкретному сообщению.
 */
export async function POST(request: Request) {
  const secret = process.env.REMINDERS_SECRET ?? "";
  const given = request.headers.get("x-reminders-secret") ?? "";
  if (!sameSecret(given, secret)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }

  const { message_id: messageId } = (await request.json().catch(() => ({}))) as { message_id?: number };
  if (!messageId) return NextResponse.json({ error: "Нет message_id" }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("admin_reply_push_targets", {
    p_secret: secret,
    p_message_id: messageId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as { endpoint: string; p256dh: string; auth: string; body: string }[];
  const results = await Promise.all(
    rows.map(async (row) => {
      const result = await sendPush(row, {
        title: "Ответ администратора",
        body: row.body,
        url: "/money/settings",
        tag: `support-${messageId}`,
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
