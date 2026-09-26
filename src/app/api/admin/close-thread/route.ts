import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";

export const runtime = "nodejs";

/**
 * Закрыть обращение с уведомлением, но без следа в базе.
 *
 * Обычный ответ админа хранится как сообщение — здесь нарочно наоборот:
 * подписки на пуш читаем напрямую (RLS у push_subscriptions уже пускает
 * админа к чужим — тем же способом шлётся обычный ответ) и шлём
 * уведомление, не вставляя ни одной строки в support_messages. Сами
 * сообщения переписки удаляет admin_close_thread с p_notify=false.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });

  const { data: admin } = await supabase.rpc("is_admin");
  if (!admin) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { user_id: targetId } = (await request.json().catch(() => ({}))) as { user_id?: string };
  if (!targetId) return NextResponse.json({ error: "Нет user_id" }, { status: 400 });

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", targetId);

  const results = await Promise.all(
    (subs ?? []).map((sub) =>
      sendPush(sub, {
        title: "Dots",
        body: "Обращение закрыто. Если вопрос снова возникнет — напишите ещё раз.",
        url: "/money/settings",
        tag: "support-closed",
      }),
    ),
  );

  const { error } = await supabase.rpc("admin_close_thread", { p_user_id: targetId, p_notify: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sent: results.filter((r) => r === "ok").length, total: results.length });
}
