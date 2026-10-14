"use client";

import { Loader } from "@/components/Loader";
import { Denied, Problem } from "@/components/admin/shared";
import { AdminHeader, useAdminRpc } from "@/components/admin/Tools";

interface Features {
  money_users: number;
  tasks_users: number;
  fem_users: number;
  all_users: number;
  money: Record<string, number>;
  tasks: Record<string, number>;
  fem: Record<string, number>;
  common: Record<string, number>;
}

const GROUPS: { key: "money" | "tasks" | "fem" | "common"; title: string; base: keyof Features; color: string; items: [string, string][] }[] = [
  {
    key: "money",
    title: "Findots",
    base: "money_users",
    color: "#10b981",
    items: [
      ["savings", "Накопления"],
      ["debts", "Долги и кредиты"],
      ["bills", "Регулярные платежи"],
      ["subcats", "Уточнения в категориях"],
      ["limits", "Лимиты на категории"],
      ["currency", "Кошельки в другой валюте"],
      ["auto_rates", "Курс автоматически"],
      ["fees", "Комиссии"],
      ["ai", "Разбор нейросетью"],
    ],
  },
  {
    key: "tasks",
    title: "Todots",
    base: "tasks_users",
    color: "#3b82f6",
    items: [
      ["time", "Задачи со временем"],
      ["remind", "Напоминания о задачах"],
      ["repeat", "Повторяющиеся задачи"],
      ["checklist", "Чек-листы"],
      ["notes", "Заметки в задачах"],
      ["water", "Вода"],
      ["sleep", "Сон"],
      ["summary", "Утренняя сводка"],
    ],
  },
  {
    key: "fem",
    title: "FemDots",
    base: "fem_users",
    color: "#ec4899",
    items: [
      ["reminders", "Напоминания о цикле"],
      ["pill", "Напоминание о таблетке"],
      ["partner", "Партнёрский режим"],
    ],
  },
  {
    key: "common",
    title: "Общее",
    base: "all_users",
    color: "#8b5cf6",
    items: [
      ["push", "Уведомления включены"],
      ["installed", "Установили как приложение"],
      ["google", "Вход через Google"],
      ["dark", "Тёмная тема"],
      ["big_text", "Крупный шрифт"],
    ],
  },
];

/**
 * Какие функции реально используют — что развивать, что никому не нужно.
 * Только сколько людей, без их данных.
 */
export default function FeaturesPage() {
  const { data, denied, problem, busy, reload } = useAdminRpc<Features>("admin_features");
  if (denied) return <Denied />;
  if (!data && !problem) return <Loader />;

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <AdminHeader title="Функции" busy={busy} onRefresh={reload} />
      {problem ? <Problem text={problem} /> : null}
      <p className="mb-3 px-1 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
        Сколько людей пользуется каждой функцией — из тех, кто пользуется самим приложением. Пустая полоса —
        функцию не нашли или она не нужна: стоит сделать заметнее или убрать.
      </p>
      {data
        ? GROUPS.map((g) => {
            const base = Number(data[g.base]) || 0;
            const rows = g.items.map(([k, label]) => ({ label, value: data[g.key][k] ?? 0 })).sort((a, b) => b.value - a.value);
            return (
              <section key={g.key} className="mb-3 rounded-2xl p-4" style={{ background: "var(--surface)" }}>
                <p className="mb-2 flex items-baseline justify-between text-[0.9375rem] font-semibold">
                  {g.title}
                  <span className="text-[0.75rem] font-normal" style={{ color: "var(--muted)" }}>
                    {g.key === "common" ? `всего людей: ${base}` : `пользуются: ${base}`}
                  </span>
                </p>
                {rows.map((r) => {
                  const p = base ? Math.round((r.value / base) * 100) : 0;
                  return (
                    <div key={r.label} className="[&:not(:first-child)]:mt-2">
                      <div className="flex items-baseline justify-between gap-2 text-[0.8125rem]">
                        <span>{r.label}</span>
                        <span className="shrink-0 tabular-nums" style={{ color: "var(--muted)" }}>
                          {r.value} · {p}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, p)}%`, background: g.color }} />
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })
        : null}
    </div>
  );
}
