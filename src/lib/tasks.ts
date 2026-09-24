import type { Task } from "./types";

/** Приоритеты — от спокойного к горящему. Цвета те же, что у знака. */
export const PRIORITIES = [
  { id: "low", label: "Не срочно", color: "#60a5fa" },
  { id: "medium", label: "Обычная", color: "#8b97a8" },
  { id: "high", label: "Горит", color: "#f97316" },
] as const;

export function priorityOf(task: Task) {
  return PRIORITIES.find((p) => p.id === task.priority) ?? PRIORITIES[1];
}

/** Дата в том виде, в каком её хранит база: без времени и часовых поясов. */
export function isoDay(shift = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + shift);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface Group {
  id: string;
  title: string;
  tasks: Task[];
  /** Просроченное подсвечиваем: это единственная кучка, требующая действий. */
  alarming?: boolean;
}

/**
 * Раскладывает задачи по кучкам, в которых человек их и держит в голове:
 * что проспал, что сегодня, что завтра, что потом и что «когда-нибудь».
 *
 * Сделанные уходят вниз одной кучкой независимо от дат — они больше не
 * работа, а история.
 */
export function group(tasks: Task[]): Group[] {
  const today = isoDay();
  const tomorrow = isoDay(1);

  const live = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  const groups: Group[] = [
    {
      id: "overdue",
      title: "Просрочено",
      alarming: true,
      tasks: live.filter((t) => t.date !== null && t.date < today),
    },
    { id: "today", title: "Сегодня", tasks: live.filter((t) => t.date === today) },
    { id: "tomorrow", title: "Завтра", tasks: live.filter((t) => t.date === tomorrow) },
    {
      id: "later",
      title: "Позже",
      tasks: live.filter((t) => t.date !== null && t.date > tomorrow),
    },
    { id: "someday", title: "Когда-нибудь", tasks: live.filter((t) => t.date === null) },
    { id: "done", title: "Сделано", tasks: done },
  ];

  return groups.filter((g) => g.tasks.length > 0).map((g) => ({ ...g, tasks: sort(g.tasks) }));
}

/**
 * Внутри кучки: сначала свой порядок, потом время, потом что раньше
 * завели. Сделанные — свежие сверху: туда смотрят, чтобы отменить ошибку.
 */
function sort(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.done && b.done) return b.created_at.localeCompare(a.created_at);
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    if (a.date !== b.date) return (a.date ?? "9999").localeCompare(b.date ?? "9999");
    if (a.time !== b.time) return (a.time ?? "99").localeCompare(b.time ?? "99");
    return a.created_at.localeCompare(b.created_at);
  });
}

/** «14:30» — секунды из базы человеку не нужны. */
export function shortTime(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}

/** Дата для строки задачи: только там, где она не ясна из заголовка кучки. */
export function dayLabel(date: string | null): string | null {
  if (!date) return null;
  const at = new Date(`${date}T00:00:00`);
  if (Number.isNaN(at.getTime())) return null;
  const now = new Date();
  return at.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
