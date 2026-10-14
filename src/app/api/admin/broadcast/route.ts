import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Рассылка на сотни устройств — дольше обычного запроса.
export const maxDuration = 60;

/**
 * Рассылка всем: объявление сохраняется в базе (его покажет полоса внизу у
 * каждого, кто откроет приложение) и уходит пушем на все устройства с
 * включёнными уведомлениями. push: false — только полоса, без пуша.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });

  const { data: admin } = await supabase.rpc("is_admin");
  if (!admin) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { title?: string; body?: string; url?: string; push?: boolean };
  const title = (body.title ?? "").trim();
  const text = (body.body ?? "").trim();
  if (!title || !text) return NextResponse.json({ error: "Нужны заголовок и текст" }, { status: 400 });

  const { data: id, error } = await supabase.rpc("admin_announce", {
    p_title: title,
    p_body: text,
    p_url: body.url ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.push === false) return NextResponse.json({ id, sent: 0, total: 0 });

  const { data: subs } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
  const targets = subs ?? [];
  let sent = 0;
  // Пачками по 25: сотня одновременных соединений с сервисами пушей
  // упирается в лимиты быстрее, чем экономит время.
  for (let i = 0; i < targets.length; i += 25) {
    const results = await Promise.all(
      targets.slice(i, i + 25).map((sub) =>
        sendPush(sub, { title, body: text, url: body.url || "/", tag: `news-${id}` }),
      ),
    );
    sent += results.filter((r) => r === "ok").length;
  }
  return NextResponse.json({ id, sent, total: targets.length });
}
