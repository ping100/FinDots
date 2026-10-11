"use client";

import type { ReactNode } from "react";
import { Icon } from "@/lib/icons";
import { Logo } from "@/components/Logo";
import type { Task } from "@/lib/tasks/types";

/**
 * Кольцо «сколько сделано за день» рядом с заголовком. Заполняется по мере
 * выполнения; всё сделано — зелёное с галочкой.
 */
export function DayProgress({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const all = done >= total;
  const r = 14;
  const length = 2 * Math.PI * r;
  const color = all ? "var(--ok)" : "var(--accent)";
  return (
    <span className="relative flex h-9 w-9 items-center justify-center" aria-label={`Сделано ${done} из ${total}`}>
      <svg width={36} height={36} viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx={18} cy={18} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={3.5} />
        <circle
          cx={18}
          cy={18}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - done / total)}
          style={{ transition: "stroke-dashoffset 500ms cubic-bezier(.22,1,.36,1), stroke 300ms" }}
        />
      </svg>
      {all ? (
        <span className="animate-pop flex" style={{ color: "var(--ok)" }}>
          <Icon name="check" size={15} />
        </span>
      ) : (
        <span className="text-[0.625rem] font-semibold tabular-nums" style={{ color: "var(--muted)" }}>
          {done}/{total}
        </span>
      )}
    </span>
  );
}

const PARTS = [
  { title: "Утро", hint: "до 12:00", icon: "sun", from: "00:00", to: "12:00" },
  { title: "День", hint: "12:00–18:00", icon: "clock", from: "12:00", to: "18:00" },
  { title: "Вечер", hint: "после 18:00", icon: "moon", from: "18:00", to: "24:00" },
];

/**
 * Задачи со временем — по частям дня, чтобы длинный список читался как
 * распорядок. Задачи без времени — сверху, «в течение дня». Если времени
 * нет ни у одной задачи, заголовки не нужны — просто список.
 */
export function TimeGroups({
  untimed,
  timed,
  render,
}: {
  untimed: Task[];
  timed: Task[];
  render: (list: Task[]) => ReactNode;
}) {
  if (timed.length === 0) return <>{render(untimed)}</>;

  const groups = PARTS.map((part) => ({
    ...part,
    tasks: timed.filter((t) => {
      const hm = (t.time ?? "").slice(0, 5);
      return hm >= part.from && hm < part.to;
    }),
  })).filter((g) => g.tasks.length > 0);

  return (
    <div className="space-y-3.5">
      {untimed.length ? (
        <div>
          <GroupTitle icon="list" title="В течение дня" />
          {render(untimed)}
        </div>
      ) : null}
      {groups.map((g) => (
        <div key={g.title}>
          <GroupTitle icon={g.icon} title={g.title} hint={g.hint} />
          {render(g.tasks)}
        </div>
      ))}
    </div>
  );
}

function GroupTitle({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold" style={{ color: "var(--muted)" }}>
      <Icon name={icon} size={13} />
      {title}
      {hint ? <span className="font-normal">· {hint}</span> : null}
    </p>
  );
}

/** Пустой день: знак Dots и пара слов — вместо одинокой строки «Пусто». */
export function EmptyDay({
  filtered,
  allDone,
  isToday,
  past,
}: {
  filtered: boolean;
  allDone: boolean;
  isToday: boolean;
  past: boolean;
}) {
  const [title, hint] = filtered
    ? ["В этой категории пусто", "Снимите фильтр, чтобы увидеть все задачи"]
    : allDone
      ? ["Всё сделано!", isToday ? "Можно выдохнуть — на сегодня дела закончены" : "Все задачи этого дня выполнены"]
      : past
        ? ["В этот день задач не было", ""]
        : isToday
          ? ["На сегодня всё свободно", "Нажмите «+», чтобы добавить задачу"]
          : ["На этот день ничего нет", "Нажмите «+», чтобы запланировать"];

  return (
    <div className="flex flex-col items-center py-10 text-center">
      <span style={{ opacity: allDone ? 1 : 0.55 }}>
        <Logo size={52} animated />
      </span>
      <p className="mt-4 text-[0.9375rem] font-semibold">{title}</p>
      {hint ? (
        <p className="mt-1 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
