/**
 * Типы Todots.
 *
 * Профиля тут нет: учётная запись одна на оба приложения, и профиль общий —
 * он лежит в @/lib/types вместе с денежными полями. Задачам из него нужны
 * только имя и тема.
 */
export type Priority = "low" | "medium" | "high";

export interface TaskCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  archived: boolean;
}

export interface Task {
  id: string;
  title: string;
  /** ISO yyyy-mm-dd; null — без даты, лежит в «Когда-нибудь». */
  date: string | null;
  /** HH:mm; задаёт порядок внутри дня. Может не быть — «когда угодно за день». */
  time: string | null;
  /** Дёрнуть телефон в это время. Без времени напоминать не о чем. */
  remind: boolean;
  category_id: string | null;
  priority: Priority;
  done: boolean;
  sort_order: number;
  note: string | null;
  created_at: string;
  /** Не успели — сама переезжает на следующий день. Иначе остаётся на
      своём дне и видна в «Пропущено». */
  carry_over: boolean;
  /** С какого дня переезжает: «перенесено с 10 окт». */
  carried_from: string | null;
  /** Повтор: выполнили — появляется следующая на ближайший подходящий день. */
  repeat: Repeat | null;
  /** weekly — дни недели ISO (1 — пн … 7 — вс); monthly — [число месяца]. */
  repeat_days: number[] | null;
  /** Из какой задачи создана повтором: отмена выполнения убирает её. */
  repeat_parent: string | null;
  checklist: ChecklistItem[];
}

export type Repeat = "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/** Что тащат пальцем: карточку задачи. */
export type DragPayload = { taskId: string };
/** Куда её можно бросить: на кружок даты в ленте или на плитку категории. */
export type DropTarget = { date: string } | { categoryId: string };
