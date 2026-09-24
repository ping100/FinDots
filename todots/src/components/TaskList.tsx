"use client";

import type { Task, TaskCategory } from "@/lib/types";
import { TaskCard } from "./TaskCard";

export function TaskList({
  tasks,
  categories,
  onToggle,
  onOpen,
  empty,
}: {
  tasks: Task[];
  categories: TaskCategory[];
  onToggle: (id: string) => void;
  onOpen: (task: Task) => void;
  empty?: string;
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
        />
      ))}
    </div>
  );
}
