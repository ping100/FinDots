import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/aiConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface HealthCheck {
  key: string;
  name: string;
  /** ok — работает, warn — работает, но есть что заметить, bad — не работает. */
  state: "ok" | "warn" | "bad";
  detail: string;
}

/**
 * Проверка сервисов одной кнопкой: база, курс валют, нейросеть, пуши,
 * фоновые задачи. Каждая проверка — по-настоящему: запрос туда, где
 * сервис живёт, а не просто «настройка есть».
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  const { data: admin } = await supabase.rpc("is_admin");
  if (!admin) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const checks = await Promise.all([database(supabase), rates(new URL(request.url).origin), ai(supabase), push(), jobs(supabase)]);
  return NextResponse.json({ checks, at: new Date().toISOString() });
}

type Db = Awaited<ReturnType<typeof createClient>>;

async function database(supabase: Db): Promise<HealthCheck> {
  const started = Date.now();
  const { error } = await supabase.rpc("is_admin");
  const ms = Date.now() - started;
  if (error) return { key: "db", name: "База данных", state: "bad", detail: error.message };
  return {
    key: "db",
    name: "База данных",
    state: ms > 1500 ? "warn" : "ok",
    detail: ms > 1500 ? `Отвечает медленно: ${ms} мс` : `Отвечает за ${ms} мс`,
  };
}

async function rates(origin: string): Promise<HealthCheck> {
  try {
    const res = await fetch(`${origin}/api/rates`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    const data = (await res.json()) as { source?: string; date?: string; kzt?: Record<string, number>; error?: string };
    if (!res.ok || !data.kzt) return { key: "rates", name: "Курс валют", state: "bad", detail: data.error ?? `Ошибка ${res.status}` };
    const usd = data.kzt.USD ? ` · $1 = ${data.kzt.USD.toLocaleString("ru-RU")} ₸` : "";
    return data.source === "nbk"
      ? { key: "rates", name: "Курс валют", state: "ok", detail: `Нацбанк, курс на ${data.date}${usd}` }
      : {
          key: "rates",
          name: "Курс валют",
          state: "warn",
          detail: `Нацбанк не ответил — работает запасной источник (на ${data.date})${usd}`,
        };
  } catch (e) {
    return { key: "rates", name: "Курс валют", state: "bad", detail: e instanceof Error ? e.message : "Не отвечает" };
  }
}

async function ai(supabase: Db): Promise<HealthCheck> {
  const { data, error } = (await supabase.rpc("ai_config_for_analysis").maybeSingle()) as {
    data: { api_key_enc: string | null; model: string } | null;
    error: { message: string } | null;
  };
  if (error) return { key: "ai", name: "Нейросеть", state: "warn", detail: `Не удалось прочитать настройку: ${error.message}` };
  if (!data?.api_key_enc) return { key: "ai", name: "Нейросеть", state: "bad", detail: "Ключ OpenRouter не задан" };
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${decryptApiKey(data.api_key_enc)}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401) return { key: "ai", name: "Нейросеть", state: "bad", detail: "Ключ OpenRouter не принят — замените его" };
    if (!res.ok) return { key: "ai", name: "Нейросеть", state: "warn", detail: `OpenRouter ответил ${res.status}` };
    const info = ((await res.json()) as { data?: { usage?: number; limit?: number | null; limit_remaining?: number | null } }).data;
    const left = info?.limit_remaining;
    const money = (n: number) => `$${n.toFixed(2)}`;
    if (left != null && left < 1) {
      return { key: "ai", name: "Нейросеть", state: "bad", detail: `Деньги на ключе заканчиваются: осталось ${money(left)}` };
    }
    return {
      key: "ai",
      name: "Нейросеть",
      state: left != null && left < 3 ? "warn" : "ok",
      detail: `${data.model} · потрачено ${money(info?.usage ?? 0)}${left != null ? ` · осталось ${money(left)}` : ""}`,
    };
  } catch (e) {
    return { key: "ai", name: "Нейросеть", state: "bad", detail: e instanceof Error ? e.message : "Не отвечает" };
  }
}

async function push(): Promise<HealthCheck> {
  const ok = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
  const secret = !!process.env.REMINDERS_SECRET;
  if (!ok) return { key: "push", name: "Уведомления", state: "bad", detail: "Не заданы ключи VAPID в Vercel" };
  if (!secret) return { key: "push", name: "Уведомления", state: "bad", detail: "Не задан REMINDERS_SECRET — напоминания не уйдут" };
  return { key: "push", name: "Уведомления", state: "ok", detail: "Ключи на месте. Проверить доставку — «Тестовое уведомление» себе" };
}

async function jobs(supabase: Db): Promise<HealthCheck> {
  const { data, error } = await supabase.rpc("admin_cron_status");
  if (error) return { key: "jobs", name: "Фоновые задачи", state: "bad", detail: error.message };
  const status = data as { jobs: { name: string; active: boolean; fails_24h: number }[]; http_bad_24h: number };
  const failing = status.jobs.filter((j) => j.fails_24h > 0);
  const off = status.jobs.filter((j) => !j.active);
  if (failing.length) {
    return { key: "jobs", name: "Фоновые задачи", state: "bad", detail: `Сбои за сутки: ${failing.map((j) => j.name).join(", ")}` };
  }
  if (off.length || status.http_bad_24h > 0) {
    return {
      key: "jobs",
      name: "Фоновые задачи",
      state: "warn",
      detail: [off.length ? `выключены: ${off.map((j) => j.name).join(", ")}` : "", status.http_bad_24h ? `ошибок сервера за сутки: ${status.http_bad_24h}` : ""]
        .filter(Boolean)
        .join(" · "),
    };
  }
  return { key: "jobs", name: "Фоновые задачи", state: "ok", detail: `Все ${status.jobs.length} работают без сбоев` };
}
