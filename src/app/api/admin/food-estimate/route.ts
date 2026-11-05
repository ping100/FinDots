import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/aiConfig";
import { askOpenRouter, modelsFor, type AiConfig } from "@/lib/aiAuto";
import { jsonFrom } from "@/lib/food/json";

export const runtime = "nodejs";
export const maxDuration = 45;

const PROMPT = [
  "Ты нутрициолог. По названию блюда или продукта оцени пищевую ценность НА 100 г",
  "(не на одну штуку и не на порцию: печенье, конфета, пирожок — всё равно на 100 г)",
  "(для напитков и жидкого — на 100 мл). Учитывай кухню Казахстана и СНГ и обычный",
  "рецепт. Если указана марка — бери значения этого продукта, если знаешь.",
  "Ответ — только JSON без пояснений:",
  '{"kcal":150,"protein":8.5,"fat":6,"carbs":15,"unit":"g","portion":250,"comment":"..."}',
  "kcal и БЖУ — на 100 г с одним знаком. unit — \"ml\" для напитков, иначе \"g\".",
  "portion — обычная порция в граммах или мл. comment — коротко, что взял за основу",
  "(например «плов с бараниной, домашний»), до 80 символов.",
].join("\n");

/**
 * Подобрать КБЖУ на 100 г по названию (только админ): для продуктов без
 * этикетки — домашних блюд, фруктов, выпечки.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const b = (await request.json().catch(() => null)) as { name?: string; brand?: string; grams?: number; unit?: string } | null;
  const name = String(b?.name ?? "").trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: "Сначала впишите название" }, { status: 400 });
  const brand = String(b?.brand ?? "").trim().slice(0, 80);
  const grams = Number(b?.grams) > 0 ? Math.round(Number(b?.grams)) : null;

  const { data: config } = (await supabase.rpc("ai_config_full")) as { data: AiConfig | null };
  if (!config?.api_key_enc) return NextResponse.json({ error: "Нейросеть не подключена" }, { status: 400 });

  // Вес порции нейросети не передаём: с ним она норовит ответить «на порцию»,
  // а нам нужно строго на 100 г. На порцию пересчитываем сами.
  void grams;
  const ask = [`Блюдо: ${name}`, brand ? `Марка: ${brand}` : "", "Значения — строго на 100 г (или 100 мл), не на штуку и не на порцию."].filter(Boolean).join("\n");
  const { response, status } = await askOpenRouter({
    task: "text",
    apiKey: decryptApiKey(config.api_key_enc),
    models: await modelsFor("text", config),
    totalMs: 38_000,
    body: {
      temperature: 0.1,
      max_tokens: 1500,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: ask },
      ],
    },
  });
  if (!response) return NextResponse.json({ error: status === 429 ? "Нейросети заняты, попробуйте через минуту" : "Нейросеть недоступна, попробуйте ещё раз" }, { status: 502 });

  const json = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string | null; reasoning?: string | null } }[] } | null;
  const msg = json?.choices?.[0]?.message;
  const d = jsonFrom(msg?.content?.trim() ? msg.content : (msg?.reasoning ?? ""));
  const num = (v: unknown, max: number) => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null;
  };
  const kcal = num(d?.kcal, 950);
  if (!d || kcal == null) return NextResponse.json({ error: "Нейросеть ответила непонятно, попробуйте ещё раз" }, { status: 502 });
  return NextResponse.json({
    kcal,
    protein: num(d.protein, 100) ?? 0,
    fat: num(d.fat, 100) ?? 0,
    carbs: num(d.carbs, 100) ?? 0,
    unit: d.unit === "ml" ? "ml" : "g",
    portion: num(d.portion, 5000),
    comment: typeof d.comment === "string" ? d.comment.trim().slice(0, 120) : "",
  });
}
