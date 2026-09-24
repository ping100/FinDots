"use client";

import { useDroppable } from "@dnd-kit/core";
import { dateRange, dayNumber, today, weekday } from "@/lib/dates";
import type { DropTarget } from "@/lib/types";

function DayCircle({
  date,
  selected,
  isToday,
  loaded,
}: {
  date: string;
  selected: boolean;
  isToday: boolean;
  loaded: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `date-${date}`,
    data: { date } satisfies DropTarget,
  });

  return (
    <div ref={setNodeRef} className="flex shrink-0 flex-col items-center gap-1 px-1.5">
      <span className="text-[0.625rem]" style={{ color: "var(--muted)" }}>
        {weekday(date)}
      </span>
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition"
        style={{
          background: selected ? "var(--accent)" : isOver ? "var(--surface-2)" : "transparent",
          color: selected ? "#fff" : "var(--text)",
          boxShadow: isToday && !selected ? "inset 0 0 0 1.5px var(--accent)" : undefined,
          outline: isOver ? "2px solid var(--accent)" : undefined,
          outlineOffset: 2,
        }}
      >
        {dayNumber(date)}
      </span>
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: loaded ? "var(--accent)" : "transparent" }}
      />
    </div>
  );
}

export function DateStrip({
  selected,
  onSelect,
  loadedDates,
}: {
  selected: string;
  onSelect: (date: string) => void;
  /** Даты, в которых есть хотя бы одна незавершённая задача — под ними точка. */
  loadedDates: Set<string>;
}) {
  const t = today();
  const days = dateRange(t, 10);

  return (
    <div className="-mx-4 flex gap-0.5 overflow-x-auto px-4 pb-1">
      {days.map((date) => (
        <button key={date} onClick={() => onSelect(date)} aria-label={date}>
          <DayCircle
            date={date}
            selected={date === selected}
            isToday={date === t}
            loaded={loadedDates.has(date)}
          />
        </button>
      ))}
    </div>
  );
}
