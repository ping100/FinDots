/**
 * Типы Todots.
 *
 * Профиля тут нет: учётная запись одна на оба приложения, и профиль общий —
 * он лежит в @/lib/types вместе с денежными полями. Задачам из него нужны
 * только имя и тема.
 */
export type Priority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  /** ISO yyyy-mm-dd; null — без даты, лежит в «Когда-нибудь». */
  date: string | null;
  /** HH:mm; задаёт порядок внутри дня. Может не быть — «когда угодно за день». */
  time: string | null;
  /** Дёрнуть телефон в это время. Без времени напоминать не о чем. */
  remind: boolean;
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
