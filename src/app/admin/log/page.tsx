"use client";

import { Loader } from "@/components/Loader";
import { Denied, Problem } from "@/components/admin/shared";
import { AdminHeader, useAdminRpc, type LogEntry } from "@/components/admin/Tools";

/** Журнал действий админов: что, с кем, кто и когда. Последние 300 записей. */
export default function LogPage() {
  const { data, denied, problem, busy, reload } = useAdminRpc<LogEntry[]>("admin_log_list");
  if (denied) return <Denied />;
  if (!data && !problem) return <Loader />;

  const dayOf = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });
  let lastDay = "";

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <AdminHeader title="Журнал действий" busy={busy} onRefresh={reload} />
      {problem ? <Problem text={problem} /> : null}
      {data && data.length === 0 ? (
        <p className="rounded-2xl p-4 text-[0.8125rem]" style={{ background: "var(--surface)", color: "var(--muted)" }}>
          Пока пусто. Сюда попадут блокировки, смена доступа, пароли, очистка и удаление аккаунтов, рассылки.
        </p>
      ) : null}
      <div>
        {(data ?? []).map((e) => {
          const day = dayOf(e.created_at);
          const head = day !== lastDay;
          lastDay = day;
          return (
            <div key={e.id}>
              {head ? (
                <p className="mb-1.5 mt-4 px-1 text-[0.75rem] font-semibold first:mt-0" style={{ color: "var(--muted)" }}>
                  {day}
                </p>
              ) : null}
              <div className="mb-1.5 rounded-2xl px-3.5 py-2.5" style={{ background: "var(--surface)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[0.875rem] font-semibold">{e.action}</span>
                  <span className="shrink-0 text-[0.6875rem] tabular-nums" style={{ color: "var(--muted)" }}>
                    {new Date(e.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {e.target_label ? <p className="truncate text-[0.8125rem]">{e.target_label}</p> : null}
                {e.details ? (
                  <p className="text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
                    {e.details}
                  </p>
                ) : null}
                <p className="mt-0.5 text-[0.625rem]" style={{ color: "var(--muted)" }}>
                  {e.admin_label ?? "админ удалён"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
