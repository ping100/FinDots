import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/aiConfig";
import type { DraftItem } from "@/lib/food/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 20);
const DEFAULT_MODEL = "google/gemma-4-31b-it:free";
/** Запасные бесплатные модели, которые видят картинки: если основная занята. */
const FALLBACK_MODELS = ["google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3.5-super-vl:free", "google/gemma-4-31b-it:free"];
/** Фото уже сжато на телефоне (~1024 px); больше — что-то не так. */
const MAX_IMAGE = 2_500_000;

const SYSTEM_PROMPT = [
  "Ты помощник в приложении учёта калорий. По фото еды или описанию словами",
  "определи блюда и оцени вес порции, калории и БЖУ каждого.",
  "Ответ — только JSON без пояснений и без markdown:",
  '{"items":[{"name":"Гречка отварная","grams":200,"kcal":220,"protein":8,"fat":2,"carbs":43}],"comment":"..."}',
  "Правила: названия по-русски, коротко и понятно (2–4 слова). Вес в граммах",
  "(для напитков — в мл как граммы). kcal — целое, БЖУ — граммы с одним знаком.",
  "Каждый отдельный продукт на тарелке — отдельный пункт (котлета и гарнир — два).",
  "Если вес указан в описании — бери его. Если не указан — оцени обычную порцию.",
  "Соусы и масло, если видны, — отдельным пунктом. Не выдумывай того, чего нет.",
  "comment — одна короткая фраза, если что-то неточно (например, «вес примерный»),",
  "иначе пустая строка. Если на фото нет еды — items пустой, comment объясняет.",
].join("\n");

const LABEL_PROMPT = [
  "Ты помощник в приложении учёта калорий. На фото — упаковка продукта или её",
  "этикетка с пищевой ценностью. Прочитай значения НА 100 г (или 100 мл).",
  "Ответ — только JSON без пояснений и без markdown:",
  '{"name":"Йогурт клубничный 2,5%","brand":"Простоквашино","kcal":90,"protein":3,"fat":2.5,"carbs":13,"pack_grams":270}',
  "name — по-русски, коротко, как на упаковке. brand — марка или пустая строка.",
  "kcal — целое; если указаны только кДж, раздели на 4,184. pack_grams — вес или",
  "объём упаковки, если виден, иначе null. Если указано на порцию, пересчитай на 100 г.",
  "Если пищевую ценность прочитать нельзя — верни {\"error\":\"коротко почему\"}.",
].join("\n");

/** Вытащить JSON из ответа: модель может обернуть его в ```json или добавить текст. */
function parseItems(text: string): { items: DraftItem[]; comment: string } | null {
  const closed = text.lastIndexOf("</think>");
  if (closed >= 0) text = text.slice(closed + 8);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data: { items?: unknown; comment?: unknown };
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(data.items)) return null;
  const num = (v: unknown, max: number) => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
  };
  const items = data.items
    .map((raw) => {
      const r = raw as Record<string, unknown>;
      const name = String(r.name ?? "").trim().slice(0, 120);
      if (!name) return null;
      const grams = num(r.grams, 10000);
      return {
        name: name[0].toUpperCase() + name.slice(1),
        grams: grams || null,
        kcal: Math.round(num(r.kcal, 20000)),
        protein: Math.round(num(r.protein, 2000) * 10) / 10,
        fat: Math.round(num(r.fat, 2000) * 10) / 10,
        carbs: Math.round(num(r.carbs, 2000) * 10) / 10,
      } satisfies DraftItem;
    })
    .filter((x): x is DraftItem => !!x)
    .slice(0, 15);
  return { items, comment: typeof data.comment === "string" ? data.comment.trim().slice(0, 200) : "" };
}

/** Пищевая ценность с этикетки на 100 г. */
function parseLabel(text: string): { name: string; brand: string | null; kcal: number; protein: number; fat: number; carbs: number; pack_grams: number | null } | { error: string } {
  const closed = text.lastIndexOf("</think>");
  if (closed >= 0) text = text.slice(closed + 8);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { error: "Не получилось прочитать этикетку, попробуйте снять ближе и ровнее" };
  }
  if (typeof d.error === "string" && d.error) return { error: `Не получилось прочитать: ${d.error}` };
  const num = (v: unknown, max: number) => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
  };
  const kcal = num(d.kcal, 950);
  if (kcal == null) return { error: "На этикетке не нашёл калорий, введите вручную" };
  const r = (v: unknown) => Math.round((num(v, 100) ?? 0) * 10) / 10;
  return {
    name: String(d.name ?? "").trim().slice(0, 120) || "Продукт",
    brand: String(d.brand ?? "").trim().slice(0, 80) || null,
    kcal: Math.round(kcal),
    protein: r(d.protein),
    fat: r(d.fat),
    carbs: r(d.carbs),
    pack_grams: num(d.pack_grams, 20000) || null,
  };
}

/**
 * Распознать еду: фото тарелки или описание словами → список блюд с весом,
 * калориями и БЖУ. Фото уходит только нейросети и нигде не сохраняется.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { image?: string; text?: string; label?: boolean } | null;
  // Этикетка: читаем пищевую ценность на 100 г (для продукта по штрихкоду).
  const label = body?.label === true;
  const image = typeof body?.image === "string" && body.image.startsWith("data:image/") ? body.image : null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 500) : "";
  if (!image && !text) return NextResponse.json({ error: "Пришлите фото или опишите, что съели" }, { status: 400 });
  if (label && !image) return NextResponse.json({ error: "Пришлите фото этикетки" }, { status: 400 });
  if (image && image.length > MAX_IMAGE) return NextResponse.json({ error: "Фото слишком большое" }, { status: 413 });

  const { data: config, error: configError } = (await supabase.rpc("ai_config_for_food").maybeSingle()) as {
    data: { api_key_enc: string | null; model: string } | null;
    error: { code?: string; message: string } | null;
  };
  if (configError) {
    return NextResponse.json(
      { error: configError.code === "42501" ? "Распознавание отключено администратором" : configError.message },
      { status: configError.code === "42501" ? 403 : 500 },
    );
  }
  if (!config?.api_key_enc) return NextResponse.json({ error: "Администратор ещё не подключил нейросеть" }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabase.from("ai_usage").select("calls").eq("user_id", user.id).eq("day", today).maybeSingle();
  const used = usage?.calls ?? 0;
  if (used >= DAILY_LIMIT) {
    return NextResponse.json({ error: `На сегодня лимит распознаваний исчерпан (${DAILY_LIMIT}). Можно добавить вручную` }, { status: 429 });
  }

  const content: ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] = [];
  if (image) content.push({ type: "image_url", image_url: { url: image } });
  content.push({ type: "text", text: label ? "Прочитай пищевую ценность на 100 г." : text ? `Описание: ${text}` : "Что на фото? Посчитай калории." });

  // Бесплатные модели часто заняты (429) или временно лежат — тогда по очереди
  // пробуем другие бесплатные, которые видят картинки. Всё — в пределах минуты.
  const models = [...new Set([config.model || DEFAULT_MODEL, ...FALLBACK_MODELS])];
  const deadline = Date.now() + 52_000;
  let response: Response | null = null;
  let failure = "";
  let lastStatus = 0;
  for (const m of models) {
    const left = deadline - Date.now();
    if (left < 6_000) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(left, 30_000));
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${decryptApiKey(config.api_key_enc)}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://localhost",
          "X-Title": "Dots",
        },
        body: JSON.stringify({
          model: m,
          temperature: 0.2,
          max_tokens: 1200,
          messages: [
            { role: "system", content: label ? LABEL_PROMPT : SYSTEM_PROMPT },
            { role: "user", content },
          ],
        }),
      });
      if (res.ok) {
        response = res;
        break;
      }
      lastStatus = res.status;
      failure = await res.text().catch(() => "");
      // Ключ или деньги — другая модель не поможет.
      if (res.status === 401 || res.status === 402) break;
    } catch (error) {
      lastStatus = error instanceof Error && error.name === "AbortError" ? 408 : 503;
    } finally {
      clearTimeout(timer);
    }
  }
  if (!response) {
    // Дневной лимит бесплатных запросов — на весь ключ, у всех людей сразу.
    if (/free-models-per-day|per-day/i.test(failure)) {
      return NextResponse.json(
        { error: "На сегодня закончились бесплатные распознавания на всё приложение. Добавьте еду вручную или словами, завтра заработает снова" },
        { status: 503 },
      );
    }
    const map: Record<number, string> = {
      400: "Нейросеть не смогла прочитать фото, попробуйте другое или опишите словами",
      401: "Нейросеть не приняла ключ, сообщите администратору",
      402: "На счету нейросети не хватает средств",
      404: "Модели для фото больше нет, администратору нужно выбрать другую",
      408: "Нейросеть не ответила вовремя, попробуйте ещё раз",
      429: "Все бесплатные нейросети сейчас заняты, попробуйте через минуту или добавьте вручную",
    };
    return NextResponse.json({ error: map[lastStatus] ?? `Нейросеть недоступна (${lastStatus || "нет связи"})` }, { status: 502 });
  }

  await supabase.from("ai_usage").upsert({ user_id: user.id, day: today, calls: used + 1 }, { onConflict: "user_id,day" });

  const json = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  if (label) {
    const product = parseLabel(json?.choices?.[0]?.message?.content ?? "");
    if ("error" in product) return NextResponse.json({ error: product.error }, { status: 422 });
    return NextResponse.json({ product, callsLeft: DAILY_LIMIT - used - 1 });
  }
  const parsed = parseItems(json?.choices?.[0]?.message?.content ?? "");
  if (!parsed) return NextResponse.json({ error: "Не получилось разобрать ответ нейросети, попробуйте ещё раз" }, { status: 502 });
  return NextResponse.json({ ...parsed, callsLeft: DAILY_LIMIT - used - 1 });
}
