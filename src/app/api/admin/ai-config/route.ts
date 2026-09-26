import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptApiKey } from "@/lib/aiConfig";

export const runtime = "nodejs";

/**
 * Управление общим ключом OpenRouter и моделью — только для админа.
 *
 * Шифрование ключа идёт здесь, в Node: сам ключ приходит от админа один
 * раз в теле запроса и в базу попадает уже как шифротекст — SQL-функции
 * его открытым текстом никогда не видят.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });

  const { data, error } = await supabase.rpc("admin_ai_config_status").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 500 });

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { apiKey?: string; model?: string };
  const model = body.model?.trim();
  if (!model) return NextResponse.json({ error: "Не указана модель" }, { status: 400 });

  const apiKey = body.apiKey?.trim();
  let apiKeyEnc: string | null = null;
  try {
    apiKeyEnc = apiKey ? encryptApiKey(apiKey) : null;
  } catch (e) {
    // Чаще всего — AI_CONFIG_SECRET ещё не задан в переменных окружения
    // Vercel. Без этого catch падение было необработанным, и клиент видел
    // только общее «Не получилось сохранить», без единой зацепки почему.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Не получилось зашифровать ключ" },
      { status: 500 },
    );
  }
  const hint = apiKey ? apiKey.slice(-4) : null;

  const { error } = await supabase.rpc("admin_set_ai_config", {
    p_model: model,
    p_api_key_enc: apiKeyEnc,
    p_hint: hint,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 500 });

  return NextResponse.json({ ok: true });
}
