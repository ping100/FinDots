"use client";

import { Loader } from "@/components/Loader";
import { Denied, Problem } from "@/components/admin/shared";
import { AdminHeader, useAdminRpc } from "@/components/admin/Tools";
import { sinceLabel } from "@/lib/admin";
import { JOB_NAMES as NAMES, agoText, everyMinutes, type CronStatus } from "@/lib/adminJobs";

/**
 * Фоновые задачи: напоминания, переносы, сводки. Если одна сломается,
 * люди просто перестанут получать напоминания — и никто об этом не
 * скажет. Здесь видно: когда отработала, были ли сбои, не встала ли.
 */
export default function JobsPage() {
  const { data, denied, problem, busy, reload } = useAdminRpc<CronStatus>("admin_cron_status");
  if (denied) return <Denied />;
  if (!data && !problem) return <Loader />;
  const now = Date.now();

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <AdminHeader back="/admin/tech" title="Фоновые задачи" busy={busy} onRefresh={reload} />
      {problem ? <Problem text={problem} /> : null}
      <p className="mb-3 px-1 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
        Работают по расписанию, без участия людей. Красное — сломалось или встало: напоминания могут не приходить.
      </p>
      <div className="space-y-2">
        {(data?.jobs ?? []).map((j) => {
          const every = everyMinutes(j.schedule);
          const stale = j.active && (!j.last_start || now - new Date(j.last_start).getTime() > (every * 3 + 5) * 60_000);
          const failed = j.last_status === "failed" || j.fails_24h > 0;
          const state = !j.active ? "off" : failed || stale ? "bad" : "ok";
          const color = state === "ok" ? "#22c55e" : state === "off" ? "#94a3b8" : "#ef4444";
          return (
            <div key={j.name} className="rounded-2xl px-3.5 py-3" style={{ background: "var(--surface)" }}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">{NAMES[j.name] ?? j.name}</span>
                <span className="shrink-0 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                  {every === 1 ? "каждую минуту" : every < 60 ? `каждые ${every} мин` : every === 60 ? "каждый час" : "раз в день"}
                </span>
              </div>
              <p className="mt-1 pl-[1.125rem] text-[0.75rem]" style={{ color: state === "bad" ? "#ef4444" : "var(--muted)" }}>
                {!j.active
                  ? "Выключена"
                  : stale
                    ? `Последний запуск ${agoText(j.last_start)} — встала`
                    : `Последний запуск ${agoText(j.last_start)} · за сутки ${j.runs_24h}${
                        j.fails_24h ? `, сбоев ${j.fails_24h}` : ", без сбоев"
                      }`}
              </p>
              {failed && j.last_message ? (
                <p className="selectable mt-1 break-words pl-[1.125rem] text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                  {j.last_message}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {data ? (
        <div className="mt-4 rounded-2xl px-3.5 py-3" style={{ background: "var(--surface)" }}>
          <p className="text-[0.9375rem] font-semibold">Вызовы сервера</p>
          <p className="mt-0.5 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
            Задачи зовут сайт, а он отправляет пуши. За сутки вызовов: {data.http_total_24h}, с ошибкой:{" "}
            <b style={{ color: data.http_bad_24h ? "#ef4444" : "inherit" }}>{data.http_bad_24h}</b>
          </p>
          {data.http_last_bad ? (
            <p className="selectable mt-1.5 break-words text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              Последняя ошибка {sinceLabel(data.http_last_bad.at)}: {data.http_last_bad.status ?? "нет ответа"}
              {data.http_last_bad.text ? ` — ${data.http_last_bad.text}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
