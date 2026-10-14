import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Тестовое уведомление человеку — проверить, доходят ли до него пуши, когда
 * он пишет «мне ничего не приходит». kind: "update" — попросить обновиться,
 * если у него старая версия приложения. Подписки читаем сессией админа:
 * правило доступа push_subscriptions пускает админа к чужим.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });

  const { data: admin } = await supabase.rpc("is_admin");
  if (!admin) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const { user_id: targetId, kind = "test" } = (await request.json().catch(() => ({}))) as {
    user_id?: string;
    kind?: "test" | "update";
  };
  if (!targetId) return NextResponse.json({ error: "Нет user_id" }, { status: 400 });

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", targetId);
  if (!subs?.length) return NextResponse.json({ error: "Уведомления у человека не включены" }, { status: 400 });

  const results = await Promise.all(
    subs.map((sub) =>
      sendPush(
        sub,
        kind === "update"
          ? {
              title: "Dots: вышло обновление",
              body: "Закройте приложение и откройте снова — подтянется новая версия с исправлениями",
              url: "/",
              tag: "admin-update",
            }
          : {
              title: "Dots",
              body: "Проверка уведомлений от администратора — если вы это видите, всё работает 👍",
              url: "/",
              tag: "admin-test",
            },
      ),
    ),
  );
  return NextResponse.json({ sent: results.filter((r) => r === "ok").length, total: results.length });
}
