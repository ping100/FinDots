import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Пробное уведомление на свои устройства — проверить, что пуши доходят,
 * не дожидаясь напоминания.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });

  // Свои подписки — правило доступа отдаёт только их.
  const { data } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
  const subscriptions = data ?? [];
  if (subscriptions.length === 0) {
    return NextResponse.json({ error: "На этом аккаунте уведомления ещё не включены" }, { status: 400 });
  }

  const results = await Promise.all(
    subscriptions.map((target) =>
      sendPush(target, {
        title: "Dots",
        body: "Уведомления работают — напоминания о задачах придут сюда",
        url: "/tasks/settings",
        tag: "test",
      }),
    ),
  );
  return NextResponse.json({ sent: results.filter((r) => r === "ok").length, total: results.length });
}
