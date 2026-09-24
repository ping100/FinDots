"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Icon } from "@/lib/icons";
import {
  WEEKDAY_HEADS,
  addMonths,
  addWeeks,
  dayNumber,
  isSameMonth,
  monthGrid,
  monthTitle,
  today,
  weekDays,
} from "@/lib/dates";
import type { DropTarget } from "@/lib/types";

function DayCell({
  date,
  selected,
  isToday,
  loaded,
  faded,
  onSelect,
}: {
  date: string;
  selected: boolean;
  isToday: boolean;
  /** В этот день есть незавершённые задачи. */
  loaded: boolean;
  /** День соседнего месяца в сетке — он есть, но приглушён. */
  faded?: boolean;
  onSelect: (date: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `date-${date}`,
    data: { date } satisfies DropTarget,
  });

  return (
    <button
      ref={setNodeRef}
      onClick={() => onSelect(date)}
      aria-label={date}
      aria-current={selected ? "date" : undefined}
      className="flex flex-col items-center gap-1 py-1"
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition"
        style={{
          background: selected ? "var(--accent)" : isOver ? "var(--surface-2)" : "transparent",
          color: selected ? "#fff" : faded ? "var(--muted)" : "var(--text)",
          boxShadow: isToday && !selected ? "inset 0 0 0 1.5px var(--accent)" : undefined,
          outline: isOver ? "2px solid var(--accent)" : undefined,
          outlineOffset: 2,
        }}
      >
        {dayNumber(date)}
      </span>
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: loaded ? (selected ? "var(--accent)" : "var(--muted)") : "transparent" }}
      />
    </button>
  );
}

export function Calendar({
  selected,
  onSelect,
  loadedDates,
}: {
  selected: string;
  onSelect: (date: string) => void;
  loadedDates: Set<string>;
}) {
  const [expanded, setExpanded] = useState(false);
  // Какой отрезок показан. Листание недель и месяцев не меняет выбранный день:
  // человек может посмотреть вперёд и вернуться, ничего не перевыбрав.
  const [anchor, setAnchor] = useState(selected);

  const t = today();
  const days = expanded ? monthGrid(anchor) : weekDays(anchor);
  const shift = (n: number) => setAnchor(expanded ? addMonths(anchor, n) : addWeeks(anchor, n));

  return (
    <div className="select-none">
      <div className="flex items-center justify-between pb-1">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 rounded-xl py-1 text-sm font-medium"
          aria-expanded={expanded}
          aria-label={expanded ? "Свернуть до недели" : "Раскрыть месяц"}
        >
          {monthTitle(anchor)}
          <Icon
            name="chevron-down"
            size={16}
            style={{ transform: expanded ? "rotate(180deg)" : undefined }}
          />
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => shift(-1)}
            aria-label={expanded ? "Предыдущий месяц" : "Предыдущая неделя"}
            className="rounded-full p-1.5"
            style={{ color: "var(--muted)" }}
          >
            <Icon name="chevron-left" size={18} />
          </button>
          {/* Кнопка «сегодня» нужна только когда ушли от него далеко. */}
          {anchor !== t ? (
            <button
              onClick={() => {
                setAnchor(t);
                onSelect(t);
              }}
              className="rounded-full px-2 py-1 text-xs font-medium"
              style={{ color: "var(--accent)" }}
            >
              Сегодня
            </button>
          ) : null}
          <button
            onClick={() => shift(1)}
            aria-label={expanded ? "Следующий месяц" : "Следующая неделя"}
            className="rounded-full p-1.5"
            style={{ color: "var(--muted)" }}
          >
            <Icon name="chevron-right" size={18} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7">
        {WEEKDAY_HEADS.map((head) => (
          <span
            key={head}
            className="pb-0.5 text-center text-[0.625rem]"
            style={{ color: "var(--muted)" }}
          >
            {head}
          </span>
        ))}
        {days.map((date) => (
          <DayCell
            key={date}
            date={date}
            selected={date === selected}
            isToday={date === t}
            loaded={loadedDates.has(date)}
            faded={expanded && !isSameMonth(date, anchor)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
