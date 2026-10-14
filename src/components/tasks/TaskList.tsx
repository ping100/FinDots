"use client";

import type { Task, TaskCategory } from "@/lib/tasks/types";
import { TaskCard } from "./TaskCard";

export function TaskList({
  tasks,
  categories,
  onToggle,
  onOpen,
  empty,
  overdue,
  settling,
  onSwipeLeft,
  swipeLabel,
  hideTime,
}: {
  tasks: Task[];
  categories: TaskCategory[];
  onToggle: (id: string) => void;
  onOpen: (task: Task) => void;
  empty?: string;
  overdue?: boolean;
  /** Только что выполненные — доигрывают анимацию, прежде чем уйти. */
  settling?: Set<string>;
  /** Свайп влево: перенести. Без него карточки не свайпаются. */
  onSwipeLeft?: (task: Task) => void;
  swipeLabel?: (task: Task) => string;
  /** На ленте дня время уже стоит слева — в карточке не дублируем. */
  hideTime?: boolean;
}) {
  if (tasks.length === 0) {
    return empty ? (
      <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
        {empty}
      </p>
    ) : null;
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          category={categories.find((c) => c.id === task.category_id)}
          onToggle={() => onToggle(task.id)}
          onOpen={() => onOpen(task)}
          overdue={overdue}
          settling={settling?.has(task.id)}
          onSwipeLeft={onSwipeLeft ? () => onSwipeLeft(task) : undefined}
          leftLabel={swipeLabel?.(task)}
          hideTime={hideTime}
        />
      ))}
    </div>
  );
}
