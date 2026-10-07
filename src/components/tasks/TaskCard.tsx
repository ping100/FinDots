"use client";

import { useDraggable } from "@dnd-kit/core";
import { Icon } from "@/lib/icons";
import type { DragPayload, Priority, Task, TaskCategory } from "@/lib/tasks/types";

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
      className="flex select-none items-center gap-2.5 rounded-xl px-2.5 py-1.5 transition"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        opacity: isDragging ? 0.35 : 1,
        // Прокрутку не запрещаем — перетаскивание пальцем начинает
        // задержка (TouchSensor). Меню телефона на долгое нажатие убираем.
        touchAction: "manipulation",
        WebkitTouchCallout: "none",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        aria-label={task.done ? "Не выполнено" : "Выполнено"}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white transition active:scale-90"
        style={{
          background: task.done ? PRIORITY_COLOR[task.priority] : "transparent",
          border: `2px solid ${PRIORITY_COLOR[task.priority]}`,
          color: task.done ? "#fff" : "transparent",
        }}
      >
        <Icon name="check" size={12} />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <p
          className="min-w-0 flex-1 truncate text-sm font-medium"
          style={{
            color: task.done ? "var(--muted)" : "var(--text)",
            textDecoration: task.done ? "line-through" : undefined,
          }}
        >
          {task.title}
        </p>
        {task.time ? (
          <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums" style={{ color: "var(--muted)" }}>
            {task.time.slice(0, 5)}
            {/* Колокольчик — единственное, что отличает «просто во столько»
                от «дёрни меня во столько». */}
            {task.remind ? (
              <span className="flex items-center" style={{ color: "var(--accent)" }}>
                <Icon name="bell" size={12} />
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {category ? (
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: category.color }}
          aria-label={category.name}
        >
          <Icon name={category.icon} size={12} />
        </span>
      ) : null}
    </div>
  );
}
