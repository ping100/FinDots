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
  /** HH:mm; задаёт и сортировку внутри дня, и момент напоминания. */
  time: string | null;
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
