import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/aiConfig";
import { askOpenRouter, modelsFor, type AiConfig } from "@/lib/aiAuto";

export const runtime = "nodejs";
export const maxDuration = 30;

const UA = { "User-Agent": "Dots/1.0 (dotsapp.vercel.app)" };

/** Откуда можно брать картинки через наш сервер (у них нет CORS, а нам нужно сжать). */
const HOSTS = [
  "images.openfoodfacts.org",
  "static.openfoodfacts.org",
  "api.openverse.org",
  "upload.wikimedia.org",
  "thumb.wikimedia.org",
  "pixabay.com",
  "cdn.pixabay.com",
  "images.pexels.com",
];

/** Только https и только публичные адреса: сервер не должен ходить во внутреннюю сеть. */
function safeHost(u: URL) {
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  if (/^[0-9.]+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
  }
  if (h.includes(":")) return false; // IPv6-адреса напрямую не принимаем
  return true;
}

export interface Candidate {
  url: string;
  source: "pixabay" | "pexels" | "off" | "openverse" | "wikimedia";
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

type Db = Awaited<ReturnType<typeof createClient>>;
type Keys = { pixabay?: string; pexels?: string };

async function photoKeys(supabase: Db): Promise<Keys> {
  const { data } = await supabase.rpc("admin_photo_keys_full");
  const out: Keys = {};
  for (const r of (data ?? []) as { provider: keyof Keys; key_enc: string }[]) {
    try {
      out[r.provider] = decryptApiKey(r.key_enc);
    } catch {
      // Ключ не расшифровался (сменили секрет) — как будто его нет.
    }
  }
  return out;
}

/** Pixabay: фото еды, понимает запросы по-русски. Картинки нужно копировать к себе — так и делаем. */
async function fromPixabay(key: string, q: string): Promise<Candidate[]> {
  const ru = /[а-яё]/i.test(q);
  const url = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&lang=${ru ? "ru" : "en"}&image_type=photo&safesearch=true&per_page=12&order=popular`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  const d = res?.ok ? ((await res.json().catch(() => null)) as { hits?: { webformatURL?: string; tags?: string }[] } | null) : null;
  return (d?.hits ?? [])
    .filter((h) => h.webformatURL?.startsWith("https://pixabay.com/") || h.webformatURL?.startsWith("https://cdn.pixabay.com/"))
    .map((h) => ({ url: h.webformatURL!, source: "pixabay" as const, title: String(h.tags ?? "").slice(0, 80) }));
}

/** Pexels: красивые фото, поиск лучше по-английски. */
async function fromPexels(key: string, q: string): Promise<Candidate[]> {
  const ru = /[а-яё]/i.test(q);
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=12${ru ? "&locale=ru-RU" : ""}`;
  const res = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  const d = res?.ok ? ((await res.json().catch(() => null)) as { photos?: { src?: { medium?: string }; alt?: string; photographer?: string }[] } | null) : null;
  return (d?.photos ?? [])
    .filter((ph) => ph.src?.medium?.startsWith("https://images.pexels.com/"))
    .map((ph) => ({ url: ph.src!.medium!, source: "pexels" as const, title: `${ph.alt ?? ""}${ph.photographer ? ` · ${ph.photographer}` : ""}`.slice(0, 80) }));
}

/** Перебрать запросы от точного к общему, пока не наберётся хотя бы min вариантов. */
async function collect(attempts: string[], find: (q: string) => Promise<Candidate[]>, min: number, seen: Set<string>) {
  const out: Candidate[] = [];
  for (const a of attempts.slice(0, 3)) {
    for (const c of await find(a)) if (!seen.has(c.url)) (seen.add(c.url), out.push(c));
    if (out.length >= min) break;
  }
  return out;
}

const mix = (a: Candidate[], b: Candidate[]) => {
  const out: Candidate[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) for (const c of [a[i], b[i]]) if (c) out.push(c);
  return out;
};

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
    // Найденное нами — с известных сайтов; ссылку, вставленную админом, — с любого
    // открытого сайта, но не с внутренних адресов (localhost, 10.x, 192.168.x…).
    const any = sp.get("any") === "1";
    if (!safeHost(u) || (!any && !HOSTS.includes(u.hostname))) return NextResponse.json({ error: "Сайт не разрешён" }, { status: 400 });
    let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      res = await fetch(u, {
        headers: { ...UA, Accept: "image/avif,image/webp,image/*,*/*;q=0.8", Referer: `${u.protocol}//${u.hostname}/` },
        redirect: "manual",
        signal: AbortSignal.timeout(12000),
      }).catch(() => null);
      const next = res && res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!next) break;
      try {
        u = new URL(next, u);
      } catch {
        res = null;
        break;
      }
      if (!safeHost(u)) return NextResponse.json({ error: "Сайт не разрешён" }, { status: 400 });
    }
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
  const keys = await photoKeys(supabase);
  const seen = new Set<string>();
  const ru = ladder(custom ? q : name, null);
  const enSteps = en ? ladder(en, null) : ru;
  // Сначала красивые фотостоки: Pixabay ищет по-русски, Pexels — по-английски.
  const [pb, px] = await Promise.all([
    keys.pixabay ? collect(ru, (a) => fromPixabay(keys.pixabay!, a), 6, seen) : Promise.resolve([]),
    keys.pexels ? collect(enSteps, (a) => fromPexels(keys.pexels!, a), 6, seen) : Promise.resolve([]),
  ]);
  const stock = mix(pb, px);
  // Мало красивых — добавляем свободные фото из Openverse и Wikimedia.
  let open: Candidate[] = [];
  if (stock.length < 6) {
    for (const attempt of ladder(q, en ? name : null).slice(0, 4)) {
      const [ov, wm] = await Promise.all([fromOpenverse(attempt), fromWikimedia(attempt)]);
      open = [...open, ...mix(ov, wm).filter((c) => !seen.has(c.url) && seen.add(c.url))];
      if (open.length >= 6) break;
    }
  }
  return NextResponse.json({
    query: q,
    stock: !!(keys.pixabay || keys.pexels),
    candidates: [...stock.slice(0, 12), ...off, ...open].slice(0, 21),
  });
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
