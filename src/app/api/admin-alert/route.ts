import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPush } from "@/lib/push";
import { sameSecret } from "@/lib/serverSecret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Пуш админам о важном: новое обращение, новая ошибка у людей, низкая
 * оценка, упавшие фоновые задачи, база почти полна, утренняя сводка.
 *
 * Зовёт сама база (admin_alert) с секретом из Vault — как пуш на ответ
 * поддержки. Текст уже собран в базе; здесь — только доставка на
 * устройства админов, у которых уведомления не выключены.
 */
export async function POST(request: Request) {
  const secret = process.env.REMINDERS_SECRET ?? "";
  const given = request.headers.get("x-reminders-secret") ?? "";
  if (!sameSecret(given, secret)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }

  const message = (await request.json().catch(() => ({}))) as { title?: string; body?: string; url?: string; tag?: string };
  if (!message.title) return NextResponse.json({ error: "Нет текста" }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc("admin_alert_targets", { p_secret: secret });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const targets = (data ?? []) as { endpoint: string; p256dh: string; auth: string }[];
  const results = await Promise.all(
    targets.map(async (target) => {
      const result = await sendPush(target, {
        title: message.title!,
        body: message.body ?? "",
        url: message.url || "/admin",
        tag: `admin-${message.tag ?? "alert"}`,
      });
      if (result === "dead") {
        await supabase.rpc("drop_push_subscription", { p_secret: secret, p_endpoint: target.endpoint });
      }
      return result;
    }),
  );
  return NextResponse.json({ sent: results.filter((r) => r === "ok").length, total: results.length });
}
