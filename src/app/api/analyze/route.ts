import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 20);
const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

interface Row {
  type: string;
  amount: number;
  currency: string;
  category_id: string | null;
  occurred_at: string;
}

export async function POST() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Ключ OpenRouter не настроен на сервере (OPENROUTER_API_KEY)" },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });

  // Дневной лимит обращений, чтобы один пользователь не выжег общий ключ.
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabase
    .from("ai_usage")
    .select("calls")
    .eq("user_id", user.id)
    .eq("day", today)
    .maybeSingle();

  const used = usage?.calls ?? 0;
  if (used >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: `На сегодня лимит анализов исчерпан (${DAILY_LIMIT})` },
      { status: 429 },
    );
  }

  // Данные собираем на сервере под RLS — клиент не может подменить чужие цифры.
  const [profileRes, ratesRes, walletsRes, categoriesRes, balancesRes, txRes] =
    await Promise.all([
      supabase.from("profiles").select("base_currency, ai_model").eq("id", user.id).single(),
      supabase.from("exchange_rates").select("code, rate_to_base"),
      supabase.from("wallets").select("id, kind, name, currency, due_date, monthly_payment, is_recurring").eq("archived", false),
      supabase.from("categories").select("id, kind, name, monthly_limit").eq("archived", false),
      supabase.from("wallet_balances").select("wallet_id, currency, balance"),
      supabase
        .from("transactions")
        .select("type, amount, currency, category_id, occurred_at")
        .gte("occurred_at", startOfMonth(-2).toISOString()),
    ]);

  const base = profileRes.data?.base_currency ?? "KZT";
  const rates = ratesRes.data ?? [];
  const toBase = (amount: number, currency: string) => {
    if (currency === base) return amount;
    const rate = (code: string) =>
      Number(rates.find((r) => r.code === code)?.rate_to_base ?? 1);
    return (amount * rate(currency)) / (rate(base) || 1);
  };

  const categories = categoriesRes.data ?? [];
  const rows = (txRes.data ?? []) as Row[];

  const bucket = (offset: number) => {
    const from = startOfMonth(offset);
    const to = startOfMonth(offset + 1);
    const perCategory = new Map<string, number>();
    let income = 0;
    for (const row of rows) {
      const at = new Date(row.occurred_at);
      if (at < from || at >= to) continue;
      const value = toBase(Number(row.amount), row.currency);
      if (row.type === "expense" && row.category_id) {
        perCategory.set(row.category_id, (perCategory.get(row.category_id) ?? 0) + value);
      }
      if (row.type === "income") income += value;
    }
    return { perCategory, income };
  };

  const now = bucket(0);
  const prev = bucket(-1);
  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? "прочее";

  const balances = balancesRes.data ?? [];
  const wallets = (walletsRes.data ?? []).map((w) => ({
    название: w.name,
    тип: w.kind,
    баланс: round(
      toBase(
        Number(balances.find((b) => b.wallet_id === w.id)?.balance ?? 0),
        w.currency,
      ),
    ),
    погасить_до: w.due_date,
    платёж_в_месяц: w.monthly_payment,
    ежемесячный: w.is_recurring,
  }));

  const summary = {
    валюта: base,
    доход_текущий_месяц: round(now.income),
    доход_прошлый_месяц: round(prev.income),
    траты_текущий_месяц: [...now.perCategory.entries()].map(([id, value]) => ({
      категория: nameOf(id),
      сумма: round(value),
      лимит: categories.find((c) => c.id === id)?.monthly_limit ?? null,
      было_в_прошлом_месяце: round(prev.perCategory.get(id) ?? 0),
    })),
    кошельки_и_долги: wallets,
  };

  const model = profileRes.data?.ai_model || DEFAULT_MODEL;

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://localhost",
        "X-Title": "Money Grid",
      },
      body: JSON.stringify({
        model,
        max_tokens: 900,
        messages: [
          {
            role: "system",
            content:
              "Ты финансовый помощник. Отвечай по-русски, коротко и конкретно, без вступлений. " +
              "Структура ответа: 1) что бросается в глаза; 2) где сократить траты — 2–4 пункта " +
              "с примерными суммами в месяц; 3) в каком порядке гасить долги и почему. " +
              "Опирайся только на переданные цифры, не выдумывай данные. Без markdown-таблиц.",
          },
          { role: "user", content: JSON.stringify(summary) },
        ],
      }),
    });
  } catch {
    return NextResponse.json({ error: "OpenRouter недоступен" }, { status: 502 });
  }

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json(
      { error: `OpenRouter ответил ${response.status}`, detail: detail.slice(0, 400) },
      { status: 502 },
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) return NextResponse.json({ error: "Пустой ответ модели" }, { status: 502 });

  await supabase
    .from("ai_usage")
    .upsert({ user_id: user.id, day: today, calls: used + 1 }, { onConflict: "user_id,day" });

  return NextResponse.json({ text, model, callsLeft: DAILY_LIMIT - used - 1 });
}

function startOfMonth(offset: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
