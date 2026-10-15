import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPush } from "@/lib/push";
import { sameSecret } from "@/lib/serverSecret";
import { signalPush, type SignalRow } from "@/lib/fem/signalPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Пуш на сигнал партнёра в FemDots: «нужна забота», «купи по дороге…»,
 * «думаю о тебе», ответы и приглашения. Кнопки ответа — в самом
 * уведомлении (см. signalPush и /api/fem-act). Зовёт сама база —
 * триггером на новую строку fem_signals, с секретом из Vault; подписки
 * и имя отправителя отдаёт функция базы.
 */
export async function POST(request: Request) {
  const secret = process.env.REMINDERS_SECRET ?? "";
  const given = request.headers.get("x-reminders-secret") ?? "";
  if (!sameSecret(given, secret)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }

  const { signal_id: id } = (await request.json().catch(() => ({}))) as { signal_id?: number };
  if (!id) return NextResponse.json({ error: "Нет signal_id" }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc("fem_signal_push_info", { p_secret: secret, p_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as ({ endpoint: string; p256dh: string; auth: string } & SignalRow)[];
  const results = await Promise.all(
    rows.map(async (row) => {
      const result = await sendPush(row, { ...signalPush(row), url: "/fem/together", tag: `fem-signal-${id}`, data: { signal_id: id } });
      if (result === "dead") {
        await supabase.rpc("drop_push_subscription", { p_secret: secret, p_endpoint: row.endpoint });
      }
      return result;
    }),
  );
  return NextResponse.json({ sent: results.filter((r) => r === "ok").length });
}
