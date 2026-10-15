import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPush } from "@/lib/push";
import { sameSecret } from "@/lib/serverSecret";
import { cycleInfo, type FemPeriod, type Goal, type Method } from "@/lib/fem/cycle";
import { adviceFor } from "@/lib/fem/partnerAdvice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HintData {
  owner_name: string;
  today: string;
  cycle_length: number;
  period_length: number;
  method: Method;
  goal: Goal | null;
  periods: FemPeriod[];
  lh_days: string[];
  mucus_days: string[];
  mood: string | null;
  symptoms: string[];
}

/**
 * Совет на день партнёру, утром по его часам: как позаботиться о ней
 * сегодня — по фазе цикла и тому, чем она делится. Тот же совет, что на
 * его экране. Просто подсказка — отвечать на неё не нужно.
 *
 * Зовёт база (pg_cron, kick_fem_partner_hints) с секретом из Vault.
 */
export async function POST(request: Request) {
  const secret = process.env.REMINDERS_SECRET ?? "";
  if (!sameSecret(request.headers.get("x-reminders-secret") ?? "", secret)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc("claim_due_fem_partner_hints", { p_secret: secret });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as { endpoint: string; p256dh: string; auth: string; data: HintData }[];
  const results = await Promise.all(
    rows.map(async (row) => {
      const tip = tipFor(row.data);
      if (!tip) return "skip";
      const result = await sendPush(row, {
        title: `💡 ${row.data.owner_name} сегодня`,
        body: tip,
        url: "/fem/together",
        tag: "fem-hint",
      });
      if (result === "dead") await supabase.rpc("drop_push_subscription", { p_secret: secret, p_endpoint: row.endpoint });
      return result;
    }),
  );
  return NextResponse.json({ sent: results.filter((r) => r === "ok").length });
}

function tipFor(d: HintData): string | null {
  const info = cycleInfo(d.periods, { cycle_length: d.cycle_length, period_length: d.period_length }, d.today, {
    lhDays: d.lh_days,
    mucusDays: d.mucus_days,
    // Как на его экране: способ контрацепции ему не виден, только «гормональная или нет».
    method: d.method !== "none" && d.method !== "iud_copper" ? "pop" : "none",
  });
  if (!info.phase) return null;
  const advice = adviceFor({
    phase: info.phase,
    info,
    mood: d.mood,
    symptoms: (d.symptoms ?? []).filter((s) => s !== "ok"),
    goal: d.goal,
    today: d.today,
  });
  return advice.todo[0] ?? null;
}
