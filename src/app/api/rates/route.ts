import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Официальные курсы: сколько тенге стоит одна единица валюты.
 *
 * Источник — Нацбанк РК (курс на день, тот же, что в банках и в новостях).
 * Если он не ответил — открытый курс open.er-api.com, чтобы человек не
 * остался совсем без курса. Ответ источника держим час: курс меняется раз
 * в день, а дёргать Нацбанк на каждое открытие приложения незачем.
 *
 * Пересчёт в основную валюту человека (если она не тенге) — на клиенте:
 * здесь одна таблица на всех.
 */
const WANTED = ["USD", "RUB", "EUR", "CNY", "KGS", "UZS", "GBP", "TRY", "AED"];

export async function GET() {
  const nbk = await fromNationalBank().catch(() => null);
  const result = nbk ?? (await fromOpenApi().catch(() => null));
  if (!result) {
    return NextResponse.json({ error: "Курс сейчас недоступен — попробуйте позже" }, { status: 502 });
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=600" } });
}

type Rates = {
  source: "nbk" | "open";
  date: string;
  kzt: Record<string, number>;
  /** Насколько курс изменился с прошлого дня, в тенге за единицу (только у Нацбанка). */
  change?: Record<string, number>;
};

async function fromNationalBank(): Promise<Rates | null> {
  const res = await fetch("https://nationalbank.kz/rss/rates_all.xml", {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const xml = await res.text();
  const kzt: Record<string, number> = {};
  const change: Record<string, number> = {};
  let date = "";
  for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (name: string) => item[1].match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim() ?? "";
    const code = tag("title");
    const value = Number(tag("description"));
    const quant = Number(tag("quant")) || 1;
    if (!WANTED.includes(code) || !(value > 0)) continue;
    kzt[code] = value / quant;
    const delta = Number(tag("change"));
    if (Number.isFinite(delta)) change[code] = delta / quant;
    date ||= tag("pubDate"); // «12.10.2026»
  }
  if (!kzt.USD || !kzt.RUB) return null;
  const [d, m, y] = date.split(".");
  return { source: "nbk", date: y ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10), kzt, change };
}

async function fromOpenApi(): Promise<Rates | null> {
  const res = await fetch("https://open.er-api.com/v6/latest/KZT", {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { rates?: Record<string, number>; time_last_update_unix?: number };
  if (!json.rates) return null;
  const kzt: Record<string, number> = {};
  // Здесь наоборот: сколько единиц валюты дают за один тенге.
  for (const code of WANTED) {
    const perKzt = json.rates[code];
    if (perKzt > 0) kzt[code] = 1 / perKzt;
  }
  if (!kzt.USD || !kzt.RUB) return null;
  const date = json.time_last_update_unix
    ? new Date(json.time_last_update_unix * 1000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return { source: "open", date, kzt };
}
