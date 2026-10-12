import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptApiKey } from "@/lib/aiConfig";
import { reviewLastCycle } from "@/lib/fem/review";
import type { FemDay, FemPeriod, FemSettings } from "@/lib/fem/cycle";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 20);
const DEFAULT_MODEL = "google/gemma-4-31b-it:free";

const SYSTEM_PROMPT = [
  "Ты бережный помощник в приложении-календаре цикла. Объясни женщине, как прошёл",
  "её прошлый цикл. Пиши только на русском, тепло и спокойно, без вступлений.",
  "Ты не врач: не ставь диагнозов и не называй болезней. Если в данных есть",
  "отклонение от нормы FIGO — мягко посоветуй обсудить это с гинекологом.",
  "Не пугай и не стыди. Не придумывай цифр: бери только готовые значения из данных.",
  "",
  "Структура: первая строка — «Итог: » и одна фраза про цикл в целом. Затем три",
  "раздела с заголовками на отдельной строке и 1–3 предложениями под каждым:",
  "«Цикл» — длина, месячные, овуляция в сравнении с обычным;",
  "«Самочувствие» — симптомы и настроение, что повторяется или стало чаще;",
  "«На что обратить внимание» — связь со стрессом, болезнью, и мягкий совет на",
  "следующий цикл (сон, вода, движение, когда сделать тест на овуляцию).",
  "Без markdown-таблиц.",
].join("\n");

const HEADING = /^\s*(?:\*\*)?\s*Итог\s*:/im;

/**
 * Разбор прошлого цикла нейросетью — только по нажатию и только после
 * отдельного согласия. Данные собираем на сервере под RLS и отправляем
 * обезличенной сводкой: без имени, заметок и подробностей близости.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });

  const [settingsRes, periodsRes, daysRes] = await Promise.all([
    supabase.from("fem_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("fem_periods").select("id, start_date, end_date").order("start_date"),
    supabase
      .from("fem_days")
      .select("day, flow, symptoms, mood, note, lh, temp, meds, pill, status, tags, weight, preg_test")
      .order("day")
      .limit(3000),
  ]);
  const settings = settingsRes.data as FemSettings | null;
  if (!settings) return NextResponse.json({ error: "FemDots ещё не настроен" }, { status: 400 });
  if (!settings.ai_consent_at) {
    return NextResponse.json({ error: "Сначала нужно согласие на разбор нейросетью" }, { status: 403 });
  }

  const days = ((daysRes.data ?? []) as FemDay[]).map((d) => ({
    ...d,
    symptoms: d.symptoms ?? [],
    meds: d.meds ?? [],
    tags: d.tags ?? [],
    // Заметки нейросети не нужны и не уходят.
    note: null,
  }));
  const review = reviewLastCycle((periodsRes.data ?? []) as FemPeriod[], days, settings);
  if (!review) {
    return NextResponse.json({ error: "Пока нечего разбирать — нужен хотя бы один завершённый цикл" }, { status: 400 });
  }

  const { data: config, error: configError } = (await supabase.rpc("ai_config_for_analysis").maybeSingle()) as {
    data: { api_key_enc: string | null; model: string } | null;
    error: { code?: string; message: string } | null;
  };
  if (configError) {
    return NextResponse.json(
      { error: configError.code === "42501" ? "Разбор нейросетью отключён администратором" : configError.message },
      { status: configError.code === "42501" ? 403 : 500 },
    );
  }
  if (!config?.api_key_enc) {
    return NextResponse.json({ error: "Администратор ещё не подключил нейросеть" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabase.from("ai_usage").select("calls").eq("user_id", user.id).eq("day", today).maybeSingle();
  const used = usage?.calls ?? 0;
  if (used >= DAILY_LIMIT) {
    return NextResponse.json({ error: `На сегодня лимит разборов исчерпан (${DAILY_LIMIT})` }, { status: 429 });
  }

  const model = config.model || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);
  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${decryptApiKey(config.api_key_enc)}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://localhost",
        "X-Title": "Dots",
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low", exclude: true },
        temperature: 0.3,
        max_tokens: 1500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(review.summary) },
          { role: "user", content: "Разбери этот цикл. Ответ — на русском, начни сразу со строки «Итог: »." },
        ],
      }),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json({ error: timedOut ? "Нейросеть не ответила вовремя — попробуйте ещё раз" : "Нейросеть недоступна" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const map: Record<number, string> = {
      401: "Нейросеть не приняла ключ — сообщите администратору",
      402: "На счету нейросети не хватает средств",
      404: "Выбранной модели больше нет — администратору нужно выбрать другую",
      429: "Слишком часто — попробуйте через минуту",
    };
    return NextResponse.json({ error: map[response.status] ?? `Нейросеть ответила ${response.status}` }, { status: 502 });
  }

  await supabase.from("ai_usage").upsert({ user_id: user.id, day: today, calls: used + 1 }, { onConflict: "user_id,day" });

  const json = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  let text = json?.choices?.[0]?.message?.content ?? "";
  // Черновик рассуждений, если модель всё же его прислала, — отрезаем.
  const closed = text.lastIndexOf("</think>");
  if (closed >= 0) text = text.slice(closed + 8);
  const start = text.search(HEADING);
  if (start > 0) text = text.slice(start);
  text = text.replace(/\*\*/g, "").trim();
  if (!text) return NextResponse.json({ error: "Нейросеть ничего не ответила" }, { status: 502 });
  return NextResponse.json({ text, model, callsLeft: DAILY_LIMIT - used - 1 });
}
