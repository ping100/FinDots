"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/Tools";
import { Denied, Problem } from "@/components/admin/shared";
import type { HealthCheck } from "@/app/api/admin/health/route";

const COLOR = { ok: "#22c55e", warn: "#f59e0b", bad: "#ef4444" };
const WORD = { ok: "работает", warn: "есть замечание", bad: "не работает" };

/** Проверка сервисов одной кнопкой — каждый по-настоящему, запросом. */
export default function HealthPage() {
  const [checks, setChecks] = useState<HealthCheck[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    const res = await fetch("/api/admin/health", { cache: "no-store" }).catch(() => null);
    setBusy(false);
    if (!res) return setProblem("Нет связи с сервером");
    if (res.status === 403) return setDenied(true);
    const data = (await res.json().catch(() => ({}))) as { checks?: HealthCheck[]; error?: string };
    if (!res.ok || !data.checks) return setProblem(data.error ?? "Не получилось");
    setChecks(data.checks);
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  if (denied) return <Denied />;
  const bad = checks?.filter((c) => c.state === "bad").length ?? 0;

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <AdminHeader title="Проверка сервисов" busy={busy} onRefresh={() => void run()} />
      {problem ? <Problem text={problem} /> : null}
      {checks ? (
        <p className="mb-3 px-1 text-[0.875rem] font-medium" style={{ color: bad ? COLOR.bad : COLOR.ok }}>
          {bad ? `Не работает: ${bad}` : "Всё работает"}
        </p>
      ) : (
        <p className="mb-3 px-1 text-[0.875rem]" style={{ color: "var(--muted)" }}>
          Проверяю…
        </p>
      )}
      <div className="space-y-2">
        {(checks ?? []).map((c) => (
          <div key={c.key} className="rounded-2xl px-3.5 py-3" style={{ background: "var(--surface)" }}>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR[c.state], boxShadow: `0 0 8px ${COLOR[c.state]}` }} />
              <span className="flex-1 text-[0.9375rem] font-semibold">{c.name}</span>
              <span className="text-[0.6875rem] font-medium" style={{ color: COLOR[c.state] }}>
                {WORD[c.state]}
              </span>
            </div>
            <p className="selectable mt-1 pl-[1.125rem] text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
              {c.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
