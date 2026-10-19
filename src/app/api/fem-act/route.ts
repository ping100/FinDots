import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { presetText } from "@/lib/fem/signalPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Кнопка в уведомлении FemDots: ответить, не открывая приложение. Зовёт
 * service worker с куками входа; текст ответа берём по коду кнопки из
 * общего списка, а не из запроса.
 *
 * - signal_id + action — ответ на сигнал («Уже бегу», «И я ❤️»…);
 * - intim_ok / intim_no — её ответ на отметку близости;
 * - send_heart — «Думаю о тебе» из дневного напоминания партнёру.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { signal_id?: number; action?: string };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  // Кнопка в дневном напоминании партнёру: «❤️ Думаю о тебе» — без сигнала-повода.
  if (body.action === "send_heart") {
    const { error } = await supabase.rpc("fem_signal_send", { p_kind: "heart", p_item: null });
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
  }

  if (!body.signal_id || !body.action) return NextResponse.json({ error: "Нет сигнала" }, { status: 400 });
  const { data: signal } = await supabase
    .from("fem_signals")
    .select("id, kind, item, to_id")
    .eq("id", body.signal_id)
    .maybeSingle();
  if (!signal || signal.to_id !== auth.user.id) return NextResponse.json({ error: "Нет такого сигнала" }, { status: 404 });

  if (body.action === "intim_ok" || body.action === "intim_no") {
    if (signal.kind !== "intim") return NextResponse.json({ error: "Не та кнопка" }, { status: 400 });
    const day = String(signal.item ?? "").split("|")[0];
    const { error } = await supabase.rpc("fem_intimacy_confirm", { p_day: day, p_ok: body.action === "intim_ok" });
    return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
  }

  const preset = presetText(signal.kind as string, body.action);
  if (!preset) return NextResponse.json({ error: "Неизвестный ответ" }, { status: 400 });
  const { error } = await supabase.rpc("fem_signal_reply", {
    p_to: signal.id,
    p_kind: preset.done ? "done" : "reply",
    p_item: preset.text,
  });
  return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ ok: true });
}
