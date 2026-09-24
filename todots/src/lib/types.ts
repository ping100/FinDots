export type Priority = "low" | "medium" | "high";

export interface Profile {
  id: string;
  display_name: string | null;
  theme: "dark" | "light";
}

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
}

/** Что тащат пальцем: карточку задачи. */
export type DragPayload = { taskId: string };
/** Куда её можно бросить: на кружок даты в ленте. */
export type DropTarget = { date: string };
