import { addDays, today } from "./dates";
import type { Repeat, Task } from "./types";

export const REPEATS: { value: Repeat | null; label: string }[] = [
  { value: null, label: "Не повторять" },
  { value: "daily", label: "Каждый день" },
  { value: "weekdays", label: "По будням" },
  { value: "weekly", label: "По неделям" },
  { value: "monthly", label: "Каждый месяц" },
  { value: "yearly", label: "Каждый год" },
];

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const DAYS_SHORT = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/** День недели ISO: 1 — понедельник … 7 — воскресенье. */
export function isoDow(iso: string): number {
  const { y, m, d } = parts(iso);
  return ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1;
}

function lastDay(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Следующая дата повтора — первая подходящая строго после `after`.
 * Число месяца берём из repeat_days, а не из даты: иначе «31-го» после
 * короткого месяца навсегда съехало бы на 30-е.
 */
export function nextDate(task: Pick<Task, "repeat" | "repeat_days" | "date">, after: string): string | null {
  const anchor = task.date ?? after;
  switch (task.repeat) {
    case "daily":
      return addDays(after, 1);
    case "weekdays":
    case "weekly": {
      const days =
        task.repeat === "weekdays" ? [1, 2, 3, 4, 5] : task.repeat_days?.length ? task.repeat_days : [isoDow(anchor)];
      for (let i = 1; i <= 7; i++) {
        const next = addDays(after, i);
        if (days.includes(isoDow(next))) return next;
      }
      return null;
    }
    case "monthly": {
      const want = task.repeat_days?.[0] ?? parts(anchor).d;
      let { y, m } = parts(after);
      for (let i = 0; i < 3; i++) {
        const candidate = iso(y, m, Math.min(want, lastDay(y, m)));
        if (candidate > after) return candidate;
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
      return null;
    }
    case "yearly": {
      const { m, d } = parts(anchor);
      let { y } = parts(after);
      for (let i = 0; i < 2; i++, y++) {
        const candidate = iso(y, m, Math.min(d, lastDay(y, m)));
        if (candidate > after) return candidate;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Куда встанет следующая, когда эту отметили выполненной. Отсчёт — от
 * её дня или от сегодня, что позже: пропущенная ежедневная, закрытая
 * сегодня, появится завтра, а не в прошлом.
 */
export function nextAfterDone(task: Task): string | null {
  const now = today();
  const from = task.date && task.date > now ? task.date : now;
  return nextDate(task, from);
}

/** Подпись: «каждый день», «по пн и чт», «каждый месяц, 5-го». */
export function repeatLabel(task: Pick<Task, "repeat" | "repeat_days" | "date">): string {
  switch (task.repeat) {
    case "daily":
      return "каждый день";
    case "weekdays":
      return "по будням";
    case "weekly": {
      const days = task.repeat_days?.length ? task.repeat_days : task.date ? [isoDow(task.date)] : [];
      if (days.length === 7) return "каждый день";
      return `по ${[...days].sort().map((d) => DAYS_SHORT[d]).join(", ")}`;
    }
    case "monthly": {
      const d = task.repeat_days?.[0] ?? (task.date ? parts(task.date).d : 1);
      return `каждый месяц, ${d}-го`;
    }
    case "yearly": {
      if (!task.date) return "каждый год";
      const { m, d } = parts(task.date);
      return `каждый год, ${d} ${MONTHS_GEN[m - 1]}`;
    }
    default:
      return "";
  }
}
