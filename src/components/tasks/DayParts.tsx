"use client";

import type { ReactNode } from "react";
import { Icon } from "@/lib/icons";
import { Logo } from "@/components/Logo";
import type { Task, TaskCategory } from "@/lib/tasks/types";

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

// ─────────────────────── «Точки»: сводка дня ───────────────────────

const PRIORITY_DOT: Record<Task["priority"], string> = { low: "#8b97a8", medium: "#f59e0b", high: "#ef4444" };

function nowHM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Карточка дня: кольцо, собранное из точек, — каждая задача дня своя
 * точка цвета категории, сделанные залиты и светятся. Рядом — сколько
 * осталось и что дальше по времени.
 */
export function DayHero({
  tasks,
  categories,
  isToday,
  past,
}: {
  tasks: Task[];
  categories: TaskCategory[];
  isToday: boolean;
  past: boolean;
}) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const left = total - done;
  const colorOf = (t: Task) => categories.find((c) => c.id === t.category_id)?.color ?? PRIORITY_DOT[t.priority];
  // Без времени — в начале круга, дальше по часам: точки идут как день.
  const order = [...tasks.filter((t) => !t.time), ...tasks.filter((t) => t.time)];
  const hm = nowHM();
  const next = tasks.find((t) => !t.done && t.time && (!isToday || t.time.slice(0, 5) >= hm));

  const S = 112;
  const R = 43;
  const dotR = total ? Math.max(3.2, Math.min(8.5, ((Math.PI * R) / total) * 0.62)) : 0;

  const title = total === 0 ? "Свободный день" : left === 0 ? "Всё сделано!" : `Осталось ${left}`;
  const sub =
    total === 0
      ? past ? "задач не было" : "Нажмите «+», чтобы добавить"
      : `${done} из ${total} ${past ? "сделано" : "уже сделано"}`;

  return (
    <div className="dots-hero mb-3 flex items-center gap-4 rounded-[1.75rem] p-4">
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="shrink-0" aria-label={`Сделано ${done} из ${total}`}>
        <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke="var(--ring-track)" strokeWidth={2} />
        {order.map((t, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(total, 1);
          const cx = S / 2 + R * Math.cos(a);
          const cy = S / 2 + R * Math.sin(a);
          const c = colorOf(t);
          return t.done ? (
            <circle key={t.id} cx={cx} cy={cy} r={dotR + 0.6} fill={c} className="dots-done" style={{ filter: `drop-shadow(0 0 5px ${c})` }} />
          ) : (
            <circle key={t.id} cx={cx} cy={cy} r={dotR} fill="var(--surface)" stroke={c} strokeWidth={2.4} />
          );
        })}
        <text x={S / 2} y={S / 2 + 7} textAnchor="middle" fontSize={21} fontWeight={800} fill="var(--text)">
          {total ? `${done}/${total}` : "0"}
        </text>
      </svg>
      <div className="min-w-0">
        <p className="dots-gradient-text text-[1.75rem] font-extrabold leading-tight tracking-tight">{title}</p>
        <p className="text-[0.8125rem]" style={{ color: "var(--muted)" }}>
          {sub}
        </p>
        {next && !past ? (
          <div className="mt-1.5 min-w-0">
            <p className="flex items-center gap-1 text-[0.6875rem] font-semibold tabular-nums" style={{ color: "var(--muted)" }}>
              <Icon name="clock" size={12} className="shrink-0" />
              Дальше · {next.time!.slice(0, 5)}
            </p>
            <p className="truncate text-[0.875rem] font-semibold">{next.title}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Категории — плитками: сколько задач дня в каждой и сколько сделано
 * (точками). Нажатие — фильтр, как раньше.
 */
export function CategoryTiles({
  categories,
  tasks,
  filter,
  onFilter,
}: {
  categories: TaskCategory[];
  tasks: Task[];
  filter: string | null;
  onFilter: (id: string | null) => void;
}) {
  if (!categories.length) return null;
  return (
    <div className="mb-1 grid grid-cols-2 gap-2">
      {categories.map((c) => {
        const mine = tasks.filter((t) => t.category_id === c.id);
        const doneN = mine.filter((t) => t.done).length;
        const on = filter === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onFilter(on ? null : c.id)}
            aria-pressed={on}
            className="money-card flex min-w-0 items-center gap-2.5 rounded-[1.125rem] px-2.5 py-2 text-left transition active:scale-[0.97]"
            style={{
              opacity: filter && !on ? 0.45 : 1,
              outline: on ? `2px solid ${c.color}` : "none",
              outlineOffset: 1,
            }}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.7rem]"
              style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 16%, transparent)`, boxShadow: `0 0 16px -6px ${c.color}` }}
            >
              <Icon name={c.icon} size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-1">
                <span className="truncate text-[0.8125rem] font-semibold">{c.name}</span>
                <span className="shrink-0 text-[0.6875rem] tabular-nums" style={{ color: "var(--muted)" }}>
                  {mine.length ? `${doneN}/${mine.length}` : "—"}
                </span>
              </span>
              <span className="mt-1 flex h-2 items-center gap-1">
                {mine.slice(0, 8).map((t) => (
                  <span
                    key={t.id}
                    className="h-2 w-2 rounded-full"
                    style={
                      t.done
                        ? { background: c.color, boxShadow: `0 0 6px ${c.color}` }
                        : { border: `1.5px solid ${c.color}` }
                    }
                  />
                ))}
                {mine.length > 8 ? (
                  <span className="text-[0.5625rem]" style={{ color: "var(--muted)" }}>
                    +{mine.length - 8}
                  </span>
                ) : null}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Лента дня: задачи со временем стоят на вертикальной линии — слева часы,
 * на линии точка цвета категории. В сегодняшнем дне линию пересекает
 * красная отметка «сейчас». Задачи без времени — сверху, «в течение дня».
 */
export function Timeline({
  untimed,
  timed,
  categories,
  showNow,
  render,
}: {
  untimed: Task[];
  timed: Task[];
  categories: TaskCategory[];
  showNow: boolean;
  render: (list: Task[], opts?: { hideTime?: boolean }) => ReactNode;
}) {
  const hm = nowHM();
  const nowAt = showNow ? timed.findIndex((t) => (t.time ?? "").slice(0, 5) > hm) : -2;
  const colorOf = (t: Task) => categories.find((c) => c.id === t.category_id)?.color ?? PRIORITY_DOT[t.priority];
  const nowMark = (
    <div key="now" className="relative h-0" style={{ margin: "12px 0 20px" }} aria-label={`Сейчас ${hm}`}>
      <span className="absolute right-0 top-0 border-t-2" style={{ left: 40, borderColor: "#f43f5e" }} />
      <span
        className="absolute -top-[9px] left-0 rounded-md px-1 text-[0.6875rem] font-extrabold tabular-nums text-white"
        style={{ background: "#f43f5e", boxShadow: "0 0 12px rgba(244,63,94,0.55)" }}
      >
        {hm}
      </span>
      <span
        className="absolute -top-[5px] h-2.5 w-2.5 rounded-full"
        style={{ left: 45, background: "#f43f5e", boxShadow: "0 0 0 4px rgba(244,63,94,0.25)" }}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {untimed.length ? (
        <div>
          <GroupTitle icon="list" title="В течение дня" />
          {render(untimed)}
        </div>
      ) : null}
      {timed.length ? (
        <div className="relative">
          {/* Сама линия дня. */}
          <span aria-hidden className="absolute bottom-2 top-2 w-0.5 rounded-full" style={{ left: 49, background: "var(--border)" }} />
          {timed.map((t, i) => (
            <div key={t.id}>
              {i === nowAt ? nowMark : null}
              <div className="relative mb-2 pl-[3.875rem]">
                <span
                  className="absolute left-0 top-3 w-10 text-right text-[0.75rem] font-bold tabular-nums"
                  style={{ color: "var(--muted)" }}
                >
                  {t.time!.slice(0, 5)}
                </span>
                <span
                  aria-hidden
                  className="absolute top-[0.85rem] h-3.5 w-3.5 rounded-full"
                  style={{
                    left: 43,
                    background: t.done ? colorOf(t) : "var(--bg)",
                    border: `3px solid ${colorOf(t)}`,
                    boxShadow: `0 0 0 3px var(--bg)${t.done ? `, 0 0 8px ${colorOf(t)}` : ""}`,
                  }}
                />
                {render([t], { hideTime: true })}
              </div>
            </div>
          ))}
          {nowAt === -1 ? nowMark : null}
        </div>
      ) : null}
    </div>
  );
}
