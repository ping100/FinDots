"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader } from "@/components/Loader";
import { Denied, Problem } from "@/components/admin/shared";
import { AdminHeader, useAdminRpc, type ErrorGroup } from "@/components/admin/Tools";
import { plural, sinceLabel } from "@/lib/admin";

const APP: Record<string, string> = { money: "Findots", tasks: "Todots", fem: "FemDots", admin: "Админка", home: "Главная" };

/**
 * Журнал ошибок: сбои, которые приложение поймало у людей. Одинаковые
 * склеены — видно, сколько раз и у скольких. «Исправлено» убирает ошибку
 * из списка; повторится — появится снова.
 */
export default function ErrorsPage() {
  const { data, denied, problem, busy, reload } = useAdminRpc<ErrorGroup[]>("admin_errors");
  const [open, setOpen] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  if (denied) return <Denied />;
  if (!data && !problem) return <Loader />;

  const resolve = async (e: ErrorGroup) => {
    setHidden((prev) => new Set(prev).add(e.fingerprint));
    const supabase = createClient();
    await supabase.rpc("admin_resolve_error", { p_fingerprint: e.fingerprint });
    await supabase
      .rpc("admin_log_add", { p_action: "Ошибка отмечена исправленной", p_target: null, p_details: e.message.slice(0, 200) })
      .then(() => undefined, () => undefined);
  };

  const list = (data ?? []).filter((e) => !hidden.has(e.fingerprint));

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <AdminHeader title="Ошибки" busy={busy} onRefresh={reload} />
      {problem ? <Problem text={problem} /> : null}
      <p className="mb-3 px-1 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
        Сбои, которые приложение поймало у людей за 30 дней. Одинаковые собраны вместе. Нажмите на ошибку —
        покажу подробности для разработчика.
      </p>
      {list.length === 0 ? (
        <div className="rounded-2xl p-6 text-center" style={{ background: "var(--surface)" }}>
          <p className="text-[2rem]">🎉</p>
          <p className="mt-1 text-[0.9375rem] font-semibold">Ошибок нет</p>
          <p className="mt-0.5 text-[0.75rem]" style={{ color: "var(--muted)" }}>
            Как только у кого-то что-то сломается — появится здесь
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((e) => {
            const expanded = open === e.fingerprint;
            const fresh = Date.now() - new Date(e.last_at).getTime() < 86400000;
            return (
              <div key={e.fingerprint} className="rounded-2xl p-3.5" style={{ background: "var(--surface)" }}>
                <button onClick={() => setOpen(expanded ? null : e.fingerprint)} className="block w-full text-left">
                  <span className="flex items-center gap-1.5 text-[0.6875rem] font-semibold">
                    <span
                      className="rounded-full px-2 py-0.5 text-white"
                      style={{ background: fresh ? "#ef4444" : "#94a3b8" }}
                    >
                      {APP[e.app ?? ""] ?? e.app ?? "?"}
                    </span>
                    <span style={{ color: "var(--muted)" }}>
                      {e.times} {plural(e.times, "раз", "раза", "раз")} · у {e.people}{" "}
                      {plural(e.people, "человека", "человек", "человек")} · {sinceLabel(e.last_at)}
                    </span>
                  </span>
                  <span className="mt-1.5 line-clamp-3 block break-words text-[0.875rem] font-medium leading-snug">
                    {e.message}
                  </span>
                </button>
                {expanded ? (
                  <div className="selectable mt-2 space-y-1.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                    <p>Экран: {e.path || "—"}</p>
                    <p>Версия: {e.build || "—"} · впервые {sinceLabel(e.first_at)}</p>
                    <p className="break-words">Браузер: {e.ua || "—"}</p>
                    {e.stack ? (
                      <pre
                        className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl p-2.5 text-[0.625rem] leading-snug"
                        style={{ background: "var(--surface-2)" }}
                      >
                        {e.stack}
                      </pre>
                    ) : null}
                  </div>
                ) : null}
                <button
                  onClick={() => void resolve(e)}
                  className="mt-2.5 rounded-full px-3.5 py-1.5 text-[0.75rem] font-semibold"
                  style={{ background: "var(--surface-2)", color: "var(--accent)" }}
                >
                  Исправлено
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
