"use client";

import { useDraggable } from "@dnd-kit/core";
import { Icon } from "@/lib/icons";
import type { DragPayload, Priority, Task, TaskCategory } from "@/lib/types";

const PRIORITY_COLOR: Record<Priority, string> = {
  low: "#8b97a8",
  medium: "#f59e0b",
  high: "#ef4444",
};

export function TaskCard({
  task,
  category,
  onToggle,
  onOpen,
}: {
  task: Task;
  category: TaskCategory | undefined;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { taskId: task.id } satisfies DragPayload,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        opacity: isDragging ? 0.35 : 1,
        touchAction: "none",
      }}
    >
      <button
        aria-label={task.done ? "Не выполнено" : "Выполнено"}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition active:scale-90"
        style={{
          background: task.done ? PRIORITY_COLOR[task.priority] : "transparent",
          border: `2px solid ${PRIORITY_COLOR[task.priority]}`,
          color: task.done ? "#fff" : "transparent",
        }}
      >
        <Icon name="check" size={14} />
      </button>

      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium"
          style={{
            color: task.done ? "var(--muted)" : "var(--text)",
            textDecoration: task.done ? "line-through" : undefined,
          }}
        >
          {task.title}
        </p>
        {task.time ? (
          <p className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: "var(--muted)" }}>
            <Icon name="clock" size={12} />
            {task.time.slice(0, 5)}
          </p>
        ) : null}
      </div>

      {category ? (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: category.color }}
          aria-label={category.name}
        >
          <Icon name={category.icon} size={14} />
        </span>
      ) : null}
    </div>
  );
}
