import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPush } from "@/lib/push";
import { sameSecret } from "@/lib/serverSecret";
import { cycleInfo, type FemPeriod, type Method } from "@/lib/fem/cycle";
import { nudgeText } from "@/lib/fem/partnerCare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NudgeData {
  owner_name: string;
  today: string;
  cycle_length: number;
  period_length: number;
  method: Method;
  periods: FemPeriod[];
  lh_days: string[];
  mucus_days: string[];
  mood: string | null;
}

/**
 * Раз в день партнёру: «удели ей минутку» — в своё время с 13 до 21 по
 * его часам, если он сам не писал ей последние 3 часа. Текст по её фазе и
 * настроению; кнопка «❤️ Думаю о тебе» отправляет его, не открывая
 * приложение (на iPhone кнопок нет — нажатие откроет «Вместе»).
 *
 * Зовёт база (pg_cron, kick_fem_partner_nudges) с секретом из Vault.
 */
export async function POST(request: Request) {
  const secret = process.env.REMINDERS_SECRET ?? "";
  if (!sameSecret(request.headers.get("x-reminders-secret") ?? "", secret)) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc("claim_due_fem_partner_nudges", { p_secret: secret });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as { endpoint: string; p256dh: string; auth: string; data: NudgeData }[];
  const results = await Promise.all(
    rows.map(async (row) => {
      const d = row.data;
      const info = cycleInfo(d.periods ?? [], { cycle_length: d.cycle_length, period_length: d.period_length }, d.today, {
        lhDays: d.lh_days ?? [],
        mucusDays: d.mucus_days ?? [],
        method: d.method !== "none" && d.method !== "iud_copper" ? "pop" : "none",
      });
      const result = await sendPush(row, {
        title: `💞 ${d.owner_name}`,
        body: nudgeText(info.phase ?? null, d.mood, d.today),
        url: "/fem/together",
        tag: "fem-nudge",
        actions: [{ action: "send_heart", title: "❤️ Думаю о тебе" }],
      });
      if (result === "dead") await supabase.rpc("drop_push_subscription", { p_secret: secret, p_endpoint: row.endpoint });
      return result;
    }),
  );
  return NextResponse.json({ sent: results.filter((r) => r === "ok").length });
}
