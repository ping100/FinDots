import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/aiConfig";
import { askOpenRouter, modelsFor, outOfFreeDaily, type AiConfig } from "@/lib/aiAuto";
import type { DraftItem } from "@/lib/food/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 20);
/** Фото уже сжато на телефоне (~1024 px); больше — что-то не так. */
const MAX_IMAGE = 2_500_000;

const SYSTEM_PROMPT = [
  "Ты помощник в приложении учёта калорий. По фото еды или описанию словами",
  "определи блюда и оцени вес порции, калории и БЖУ каждого.",
  "Ответ — только JSON без пояснений и без markdown:",
  '{"items":[{"name":"Гречка отварная","grams":200,"unit":"g","kcal":220,"protein":8,"fat":2,"carbs":43},{"name":"Кефир 2,5%","grams":250,"unit":"ml","kcal":133,"protein":7,"fat":6,"carbs":10}],"comment":"..."}',
  "Правила: названия по-русски, коротко и понятно (2–4 слова). Вес в граммах, unit \"g\";",
  "для напитков и жидкого (вода, сок, чай, кофе, молоко, кефир, бульон) — объём в мл",
  "в поле grams и unit \"ml\". kcal — целое, БЖУ — граммы с одним знаком.",
  "Каждый отдельный продукт на тарелке — отдельный пункт (котлета и гарнир — два).",
  "Но готовое смешанное блюдо — один пункт, не раскладывай его на ингредиенты: плов,",
  "лагман, манты, бешбармак, куырдак, суп, борщ, салат, паста, омлет, каша и т. п.",
  "Рис с морковью, мясом и специями — это плов. Учитывай кухню Казахстана и СНГ.",
  "Если вес указан в описании — бери его. Если не указан — оцени обычную порцию.",
  "Соусы и масло, если видны, — отдельным пунктом. Не выдумывай того, чего нет.",
  "comment — одна короткая фраза, если что-то неточно (например, «вес примерный»),",
  "иначе пустая строка. Если на фото нет еды — items пустой, comment объясняет.",
].join("\n");

const LABEL_PROMPT = [
  "Ты помощник в приложении учёта калорий. На фото — упаковка продукта или её",
  "этикетка с пищевой ценностью. Прочитай значения НА 100 г (или 100 мл).",
  "Ответ — только JSON без пояснений и без markdown:",
  '{"name":"Йогурт клубничный 2,5%","brand":"Простоквашино","kcal":90,"protein":3,"fat":2.5,"carbs":13,"pack_grams":270,"unit":"g"}',
  "unit — \"ml\", если продукт жидкий и значения на 100 мл (сок, молоко, напиток), иначе \"g\".",
  "name — по-русски, коротко, как на упаковке. brand — марка или пустая строка.",
  "kcal — целое; если указаны только кДж, раздели на 4,184. pack_grams — вес или",
  "объём упаковки, если виден, иначе null. Если указано на порцию, пересчитай на 100 г.",
  "Если пищевую ценность прочитать нельзя — верни {\"error\":\"коротко почему\"}.",
].join("\n");

/**
 * Вытащить JSON из ответа. Модели бывают небрежны: оборачивают в ```json,
 * добавляют текст, ставят лишнюю запятую в конце списка или «умные» кавычки.
 */
/**
 * Ответ оборвался на середине (кончились токены): отрезаем недописанное
 * после последней закрытой «}» и закрываем открытые скобки. Так блюда,
 * которые модель успела перечислить, не пропадают.
 */
function closeCut(raw: string): Record<string, unknown> | null {
  let tries = 0;
  for (let i = raw.length - 1; i > 0 && tries < 12; i--) {
    if (raw[i] !== "}") continue;
    tries++;
    const part = raw.slice(0, i + 1);
    const stack: string[] = [];
    let inStr = false;
    for (let k = 0; k < part.length; k++) {
      const ch = part[k];
      if (inStr) {
        if (ch === "\\") k++;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{" || ch === "[") stack.push(ch);
      else if (ch === "}" || ch === "]") stack.pop();
    }
    if (inStr) continue;
    const closed = part + stack.reverse().map((c) => (c === "{" ? "}" : "]")).join("");
    try {
      const d = JSON.parse(closed.replace(/,\s*([}\]])/g, "$1"));
      if (d && typeof d === "object") return d as Record<string, unknown>;
    } catch {
      // режем ещё на одну «}» раньше
    }
  }
  return null;
}

function jsonFrom(text: string): Record<string, unknown> | null {
  const closed = text.lastIndexOf("</think>");
  if (closed >= 0) text = text.slice(closed + 8);
  text = text.replace(/```(?:json)?/gi, "");
  const start = text.indexOf("{");
  let end = text.lastIndexOf("}");
  // Ответ — просто список блюд без обёртки: «[` идёт раньше первой «{».
  const a = text.indexOf("[");
  const b = text.lastIndexOf("]");
  if (a >= 0 && b > a && (start < 0 || a < start)) return jsonFrom(`{"items":${text.slice(a, b + 1)}}`);
  if (start < 0) return null;
  if (end <= start) end = text.length - 1;
  const raw = text.slice(start, end + 1);
  for (const variant of [raw, raw.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"')]) {
    try {
      const d = JSON.parse(variant);
      if (d && typeof d === "object") return d as Record<string, unknown>;
    } catch {
      // пробуем исправленный вариант
    }
  }
  return closeCut(text.slice(start));
}

function parseItems(text: string): { items: DraftItem[]; comment: string } | null {
  const data = jsonFrom(text) as { items?: unknown; comment?: unknown } | null;
  if (!data) return null;
  // Иногда кладут список под другим именем.
  if (!Array.isArray(data.items)) {
    const alt = Object.values(data).find((v) => Array.isArray(v));
    if (!alt) return null;
    data.items = alt;
  }
  if (!Array.isArray(data.items)) return null;
  const num = (v: unknown, max: number) => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
  };
  const items = data.items
    .map((raw): DraftItem | null => {
      const r = raw as Record<string, unknown>;
      const name = String(r.name ?? "").trim().slice(0, 120);
      if (!name) return null;
      const grams = num(r.grams, 10000);
      return {
        name: name[0].toUpperCase() + name.slice(1),
        grams: grams || null,
        unit: r.unit === "ml" ? "ml" : r.unit === "g" ? "g" : null,
        kcal: Math.round(num(r.kcal, 20000)),
        protein: Math.round(num(r.protein, 2000) * 10) / 10,
        fat: Math.round(num(r.fat, 2000) * 10) / 10,
        carbs: Math.round(num(r.carbs, 2000) * 10) / 10,
      };
    })
    .filter((x): x is DraftItem => !!x)
    .slice(0, 15);
  return { items, comment: typeof data.comment === "string" ? data.comment.trim().slice(0, 200) : "" };
}

/** Пищевая ценность с этикетки на 100 г. */
function parseLabel(text: string): { name: string; brand: string | null; kcal: number; protein: number; fat: number; carbs: number; pack_grams: number | null; unit: "g" | "ml" | null } | { error: string } {
  const d = jsonFrom(text);
  if (!d) return { error: "Не получилось прочитать этикетку, попробуйте снять ближе и ровнее" };
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
    kcal: Math.round(kcal * 10) / 10,
    protein: r(d.protein),
    fat: r(d.fat),
    carbs: r(d.carbs),
    pack_grams: num(d.pack_grams, 20000) || null,
    unit: d.unit === "ml" ? "ml" : d.unit === "g" ? "g" : null,
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

  const { data: config, error: configError } = (await supabase.rpc("ai_config_full")) as {
    data: AiConfig | null;
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

  // Модель занята (429) или лежит — askOpenRouter пробует следующую подходящую.
  // Ответила, но не по формату — один раз спрашиваем другую модель.
  const all = await modelsFor("vision", config);
  const tried = new Set<string>();
  const apiKey = decryptApiKey(config.api_key_enc);
  let counted = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const models = all.filter((m) => !tried.has(m));
    if (!models.length) break;
    const { response, model, status: lastStatus, failure } = await askOpenRouter({
      task: "vision",
      apiKey,
      models,
      totalMs: attempt ? 22_000 : 34_000,
      body: {
        temperature: 0.2,
        // С запасом: модели, которые сначала «думают», тратят на это часть токенов.
        max_tokens: 4000,
        messages: [
          { role: "system", content: label ? LABEL_PROMPT : SYSTEM_PROMPT },
          { role: "user", content },
        ],
      },
    });
    if (!response) {
      if (attempt) break;
      // Дневной лимит бесплатных запросов — на весь ключ, у всех людей сразу.
      if (outOfFreeDaily(failure)) {
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
    tried.add(model);

    if (!counted) {
      counted = true;
      await supabase.from("ai_usage").upsert({ user_id: user.id, day: today, calls: used + 1 }, { onConflict: "user_id,day" });
    }

    const json = (await response.json().catch(() => null)) as {
      choices?: { finish_reason?: string; message?: { content?: string | { type?: string; text?: string }[] | null; reasoning?: string | null } }[];
    } | null;
    const msg = json?.choices?.[0]?.message;
    // Текст бывает строкой или списком кусочков; пустой — когда модель всё «продумала» и не успела ответить.
    const text = Array.isArray(msg?.content) ? msg.content.map((c) => c?.text ?? "").join("") : (msg?.content ?? "");
    const reply = text.trim() ? text : (msg?.reasoning ?? "");
    if (label) {
      const product = parseLabel(reply);
      if (!("error" in product)) return NextResponse.json({ product, callsLeft: DAILY_LIMIT - used - 1 });
      if (attempt || jsonFrom(reply)) return NextResponse.json({ error: product.error }, { status: 422 });
    } else {
      const parsed = parseItems(reply);
      if (parsed) return NextResponse.json({ ...parsed, callsLeft: DAILY_LIMIT - used - 1 });
    }
    console.warn("food-analyze: ответ не по формату", model, JSON.stringify(reply.slice(0, 300)));
    // В журнал ошибок админки: какая модель и что ответила — чтобы понять, что чинить.
    await supabase
      .rpc("log_client_error", {
        p_app: "food",
        p_path: "/api/food-analyze",
        p_message: `Распознавание: ответ не по формату (${model})`,
        p_stack: `finish: ${json?.choices?.[0]?.finish_reason ?? "?"}\nreply: ${reply.slice(0, 1500) || "(пусто)"}`,
        p_build: process.env.NEXT_PUBLIC_BUILD ?? null,
        p_ua: null,
      })
      .then(
        () => undefined,
        () => undefined,
      );
  }
  return NextResponse.json({ error: "Нейросеть ответила непонятно. Попробуйте ещё раз или опишите словами" }, { status: 502 });
}
