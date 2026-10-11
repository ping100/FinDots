"use client";

import { useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Icon } from "@/lib/icons";
import { shortDay } from "@/lib/tasks/dates";
import { buzz } from "@/lib/dragFx";
import type { DragPayload, Priority, Task, TaskCategory } from "@/lib/tasks/types";

const PRIORITY_COLOR: Record<Priority, string> = {
  low: "#8b97a8",
  medium: "#f59e0b",
  high: "#ef4444",
};

/** Насколько протащить вбок, чтобы свайп сработал. */
const SWIPE_AT = 80;

export function TaskCard({
  task,
  category,
  onToggle,
  onOpen,
  overdue,
  settling,
  onSwipeLeft,
  leftLabel = "Завтра",
}: {
  task: Task;
  category: TaskCategory | undefined;
  /** В «Пропущено»: показать, от какого она дня. */
  overdue?: boolean;
  /** Только что выполнена: галочка подпрыгивает, задача уезжает в «Выполнено». */
  settling?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  /** Свайп влево — перенести (подпись — куда). Вправо — то же, что галочка. */
  onSwipeLeft?: () => void;
  leftLabel?: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { taskId: task.id } satisfies DragPayload,
  });

  // Свайп. Направление решается на первых 10 px: вбок — наш жест, вверх-вниз
  // — прокрутка страницы, держать на месте — перетаскивание на другой день.
  const [dx, setDx] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const gesture = useRef<{ x: number; y: number; dir: "h" | "v" | null } | null>(null);
  const dxRef = useRef(0);
  const swiped = useRef(false);

  const move = (value: number) => {
    const clamped = Math.max(-140, Math.min(140, value));
    // Порог пройден — короткий отклик, чтобы было понятно, что уже сработает.
    if (Math.abs(clamped) >= SWIPE_AT !== Math.abs(dxRef.current) >= SWIPE_AT) buzz(6);
    dxRef.current = clamped;
    setDx(clamped);
  };

  const checks = task.checklist ?? [];
  const checked = checks.filter((c) => c.done).length;
  const color = PRIORITY_COLOR[task.priority];

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onTouchStart={(e) => {
        listeners?.onTouchStart?.(e);
        const t = e.touches[0];
        gesture.current = { x: t.clientX, y: t.clientY, dir: null };
        swiped.current = false;
        setSnapping(false);
      }}
      onTouchMove={(e) => {
        const g = gesture.current;
        if (!g || isDragging || !onSwipeLeft) return;
        const t = e.touches[0];
        const ddx = t.clientX - g.x;
        const ddy = t.clientY - g.y;
        if (!g.dir) {
          if (Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy) * 1.3) g.dir = "h";
          else if (Math.abs(ddy) > 10) g.dir = "v";
        }
        if (g.dir === "h") move(ddx);
      }}
      onTouchEnd={() => {
        const g = gesture.current;
        gesture.current = null;
        if (g?.dir === "h") {
          swiped.current = true;
          if (dxRef.current >= SWIPE_AT) onToggle();
          else if (dxRef.current <= -SWIPE_AT) onSwipeLeft?.();
        }
        setSnapping(true);
        dxRef.current = 0;
        setDx(0);
      }}
      onClick={() => {
        // После свайпа браузер иногда всё равно присылает «нажатие».
        if (swiped.current) {
          swiped.current = false;
          return;
        }
        onOpen();
      }}
      // Перенесённая сама задача качнётся при появлении: «я тут со вчера».
      className={`relative select-none overflow-hidden rounded-xl ${
        task.carried_from && !task.done && !overdue ? "animate-nudge" : ""
      } ${settling ? "animate-complete" : ""}`}
      style={{
        opacity: isDragging ? 0.35 : 1,
        // Вертикальная прокрутка — браузеру, движение вбок — свайпу.
        // Перетаскивание на день начинает задержка (TouchSensor).
        touchAction: "pan-y",
        WebkitTouchCallout: "none",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Под карточкой: слева — «готово», справа — «перенести». */}
      {dx !== 0 ? (
        <div
          className="absolute inset-0 flex items-center justify-between px-4 text-xs font-semibold text-white"
          style={{ background: dx > 0 ? "var(--ok)" : "var(--accent)" }}
          aria-hidden
        >
          {dx > 0 ? (
            <span className="flex items-center gap-1.5" style={{ opacity: Math.min(1, dx / SWIPE_AT) }}>
              <Icon name="check" size={16} />
              {task.done ? "Вернуть" : "Готово"}
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1.5" style={{ opacity: Math.min(1, -dx / SWIPE_AT) }}>
              {leftLabel}
              <Icon name="carry" size={16} />
            </span>
          )}
        </div>
      ) : null}

      <div
        className="relative flex items-center gap-2.5 rounded-xl px-2.5 py-1.5"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: snapping ? "transform 260ms cubic-bezier(.22,1,.36,1)" : undefined,
        }}
      >
        <button
          aria-label={task.done ? "Не выполнено" : "Выполнено"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white transition active:scale-90 ${
            settling ? "animate-pop" : ""
          }`}
          style={{
            background: task.done ? color : "transparent",
            border: `2px solid ${color}`,
            color: task.done ? "#fff" : "transparent",
          }}
        >
          <Icon name="check" size={12} />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Зачёркивание — линией, которая прочерчивается слева направо,
              а не мгновенным line-through. */}
          <p
            className="min-w-0 flex-1 truncate text-sm font-medium"
            style={{
              color: task.done ? "var(--muted)" : "var(--text)",
              backgroundImage: "linear-gradient(currentColor, currentColor)",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "0 55%",
              backgroundSize: task.done ? "100% 1.5px" : "0% 1.5px",
              transition: "background-size 320ms ease-out, color 200ms",
            }}
          >
            {task.title}
          </p>
          {overdue && task.date ? (
            <span className="shrink-0 text-xs" style={{ color: "var(--danger)" }}>
              {shortDay(task.date)}
            </span>
          ) : task.carried_from && !task.done ? (
            <span className="flex shrink-0 items-center gap-0.5 text-xs" style={{ color: "var(--muted)" }}>
              <Icon name="carry" size={11} />с {shortDay(task.carried_from)}
            </span>
          ) : null}
          {checks.length ? (
            <span
              className="flex shrink-0 items-center gap-0.5 text-xs tabular-nums"
              style={{ color: checked === checks.length ? "var(--ok)" : "var(--muted)" }}
            >
              <Icon name="checklist" size={12} />
              {checked}/{checks.length}
            </span>
          ) : null}
          {task.note ? (
            <span className="flex shrink-0" style={{ color: "var(--muted)" }} aria-label="Есть заметка">
              <Icon name="note" size={12} />
            </span>
          ) : null}
          {task.repeat ? (
            <span className="flex shrink-0" style={{ color: "var(--muted)" }} aria-label="Повторяется">
              <Icon name="repeat" size={12} />
            </span>
          ) : null}
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
    </div>
  );
}
