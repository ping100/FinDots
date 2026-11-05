import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/aiConfig";
import { askOpenRouter, modelsFor, type AiConfig } from "@/lib/aiAuto";

export const runtime = "nodejs";
export const maxDuration = 30;

const UA = { "User-Agent": "Dots/1.0 (dotsapp.vercel.app)" };

/** Откуда можно брать картинки через наш сервер (у них нет CORS, а нам нужно сжать). */
const HOSTS = ["images.openfoodfacts.org", "static.openfoodfacts.org", "api.openverse.org", "upload.wikimedia.org", "thumb.wikimedia.org"];

export interface Candidate {
  url: string;
  source: "off" | "openverse" | "wikimedia";
  title: string;
}

async function admin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc("is_admin");
  return data === true ? supabase : null;
}

/** Название по-английски: в открытых фотобанках подписи в основном на английском. */
async function english(supabase: Awaited<ReturnType<typeof createClient>>, name: string): Promise<string | null> {
  const { data: config } = (await supabase.rpc("ai_config_full")) as { data: AiConfig | null };
  if (!config?.api_key_enc) return null;
  const { response } = await askOpenRouter({
    task: "text",
    apiKey: decryptApiKey(config.api_key_enc),
    models: await modelsFor("text", config),
    perTryMs: 8_000,
    totalMs: 14_000,
    body: {
      temperature: 0,
      // Модели, которые сначала «думают», тратят токены на размышления: даём запас.
      max_tokens: 400,
      reasoning: { effort: "low", exclude: true },
      messages: [
        { role: "system", content: "Translate the food name to English for a stock photo search. 1-3 words, no brand, lowercase, answer with the words only." },
        { role: "user", content: name },
      ],
    },
  }).catch(() => ({ response: null }));
  const json = response ? ((await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null) : null;
  let text = json?.choices?.[0]?.message?.content ?? "";
  const closed = text.lastIndexOf("</think>");
  if (closed >= 0) text = text.slice(closed + 8);
  text = text.replace(/[^a-zA-Z\s-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return text && text.length <= 40 ? text : null;
}

/**
 * Запросы от точного к общему. По-английски: целиком и два последних слова
 * («chicken croissant»). По-русски главное слово первое: целиком, первые два,
 * первое («круассан»). Короткие слова («с», «на») и цифры не в счёт.
 */
function ladder(q: string, alt: string | null): string[] {
  const words = (src: string) =>
    src
      .toLowerCase()
      .replace(/[«»"(),.%]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !/\d/.test(w));
  const steps = (src: string) => {
    const ws = words(src);
    if (!ws.length) return [];
    if (/^[a-z\s-]+$/.test(ws.join(" "))) return [ws.join(" "), ws.slice(-2).join(" ")];
    return [ws.join(" "), ws.slice(0, 2).join(" "), ws[0]];
  };
  const main = steps(q);
  // Есть перевод: английский, потом русское главное слово, потом остальное.
  const out = alt ? [...main, ...steps(alt).reverse()] : main;
  return [...new Set(out)];
}

async function fromOff(code: string): Promise<Candidate[]> {
  if (!/^[0-9]{8,14}$/.test(code) || /^99[0-9]{12}$/.test(code)) return [];
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=image_front_url,image_url,product_name`, {
    headers: UA,
    signal: AbortSignal.timeout(7000),
  }).catch(() => null);
  const d = res?.ok ? ((await res.json().catch(() => null)) as { product?: Record<string, string> } | null) : null;
  const urls = [d?.product?.image_front_url, d?.product?.image_url].filter((u): u is string => !!u && u.startsWith("https://images.openfoodfacts.org/"));
  return [...new Set(urls)].map((url) => ({ url, source: "off" as const, title: "Фото упаковки, Open Food Facts" }));
}

async function fromOpenverse(q: string): Promise<Candidate[]> {
  const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=10&mature=false`, {
    headers: UA,
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  const d = res?.ok ? ((await res.json().catch(() => null)) as { results?: { thumbnail?: string; title?: string }[] } | null) : null;
  return (d?.results ?? [])
    .filter((r) => r.thumbnail?.startsWith("https://api.openverse.org/"))
    .map((r) => ({ url: r.thumbnail!, source: "openverse" as const, title: String(r.title ?? "").slice(0, 80) }));
}

async function fromWikimedia(q: string): Promise<Candidate[]> {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=8" +
    `&gsrsearch=${encodeURIComponent(`${q} filetype:bitmap`)}&prop=imageinfo&iiprop=url|mime&iiurlwidth=360`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) }).catch(() => null);
  const d = res?.ok
    ? ((await res.json().catch(() => null)) as { query?: { pages?: Record<string, { title?: string; index?: number; imageinfo?: { thumburl?: string; mime?: string }[] }> } } | null)
    : null;
  return Object.values(d?.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .filter((p) => /image\/(jpeg|png|webp)/.test(p.imageinfo?.[0]?.mime ?? "") && p.imageinfo?.[0]?.thumburl)
    .map((p) => ({ url: p.imageinfo![0].thumburl!, source: "wikimedia" as const, title: String(p.title ?? "").replace(/^File:/, "").slice(0, 80) }));
}

/**
 * Картинки для продукта (только админ).
 * ?q=название&code=штрихкод — варианты: фото упаковки из Open Food Facts,
 * затем свободные фото из Openverse и Wikimedia Commons.
 * ?img=адрес — отдать картинку с разрешённого сайта, чтобы её можно было
 * сжать в браузере (напрямую браузер не даст прочитать чужую картинку).
 */
export async function GET(request: NextRequest) {
  const supabase = await admin();
  if (!supabase) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const sp = request.nextUrl.searchParams;

  const img = sp.get("img");
  if (img) {
    let u: URL;
    try {
      u = new URL(img);
    } catch {
      return NextResponse.json({ error: "Плохая ссылка" }, { status: 400 });
    }
    if (u.protocol !== "https:" || !HOSTS.includes(u.hostname)) return NextResponse.json({ error: "Сайт не разрешён" }, { status: 400 });
    const res = await fetch(u, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(12000) }).catch(() => null);
    const type = res?.headers.get("content-type") ?? "";
    if (!res?.ok || !type.startsWith("image/")) return NextResponse.json({ error: "Картинка не загрузилась" }, { status: 502 });
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 6_000_000) return NextResponse.json({ error: "Картинка слишком большая" }, { status: 413 });
    return new NextResponse(buf, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=600" } });
  }

  const name = (sp.get("q") ?? "").trim().slice(0, 120);
  const code = (sp.get("code") ?? "").replace(/\D/g, "");
  if (!name) return NextResponse.json({ error: "Нужно название" }, { status: 400 });
  // Своя строка поиска от админа — как есть; иначе переводим название.
  const custom = sp.get("custom") === "1";
  const [off, en] = await Promise.all([fromOff(code), custom ? Promise.resolve(null) : english(supabase, name)]);
  const q = en ?? name;
  // По длинному названию фотобанки часто ничего не знают («Круассан с
  // куриной грудкой» — пусто, «круассан» — есть). Пробуем короче, пока не найдём.
  const rest: Candidate[] = [];
  const seen = new Set<string>();
  for (const attempt of ladder(q, en ? name : null).slice(0, 4)) {
    const [ov, wm] = await Promise.all([fromOpenverse(attempt), fromWikimedia(attempt)]);
    // Чередуем источники.
    for (let i = 0; i < Math.max(ov.length, wm.length); i++) {
      for (const c of [ov[i], wm[i]]) if (c && !seen.has(c.url)) (seen.add(c.url), rest.push(c));
    }
    if (rest.length >= 6) break;
  }
  return NextResponse.json({ query: q, candidates: [...off, ...rest].slice(0, 18) });
}

/**
 * Перевести сразу много названий одним запросом к нейросети — для
 * автоподбора, чтобы не тратить дневной лимит на каждый продукт.
 * Тело: {names: string[]} → {en: (string|null)[]}.
 */
export async function POST(request: Request) {
  const supabase = await admin();
  if (!supabase) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { names?: unknown } | null;
  const names = (Array.isArray(body?.names) ? body.names : []).map((n) => String(n).trim().slice(0, 120)).slice(0, 60);
  if (!names.length) return NextResponse.json({ en: [] });
  const { data: config } = (await supabase.rpc("ai_config_full")) as { data: AiConfig | null };
  if (!config?.api_key_enc) return NextResponse.json({ en: names.map(() => null) });
  const { response } = await askOpenRouter({
    task: "text",
    apiKey: decryptApiKey(config.api_key_enc),
    models: await modelsFor("text", config),
    perTryMs: 15_000,
    totalMs: 25_000,
    body: {
      temperature: 0,
      max_tokens: 40 * names.length + 600,
      reasoning: { effort: "low", exclude: true },
      messages: [
        {
          role: "system",
          content:
            "Translate each food name to English for a stock photo search: 1-3 words, no brand, lowercase. Answer with a JSON array of strings in the same order, nothing else.",
        },
        { role: "user", content: JSON.stringify(names) },
      ],
    },
  }).catch(() => ({ response: null }));
  const json = response ? ((await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null) : null;
  let text = json?.choices?.[0]?.message?.content ?? "";
  const closed = text.lastIndexOf("</think>");
  if (closed >= 0) text = text.slice(closed + 8);
  let list: unknown = null;
  try {
    list = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
  } catch {
    list = null;
  }
  const arr = Array.isArray(list) && list.length === names.length ? list : names.map(() => null);
  const clean = (v: unknown) => {
    const t = String(v ?? "").replace(/[^a-zA-Z\s-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    return t && t.length <= 40 ? t : null;
  };
  return NextResponse.json({ en: arr.map(clean) });
}
