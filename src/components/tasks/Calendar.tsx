"use client";

import { useRef, useState } from "react";
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
} from "@/lib/tasks/dates";
import type { DropTarget } from "@/lib/tasks/types";

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
  const shift = (n: number) =>
    setAnchor((current) => (expanded ? addMonths(current, n) : addWeeks(current, n)));

  const swipe = useSwipe(shift);

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
      </div>

      {/* Дни листаются пальцем: неделя или месяц едут за ним, как в
          календаре телефона. Вертикальный жест отдаём странице — по нему
          прокручивается список задач. */}
      <div ref={swipe.box} className="overflow-hidden" style={{ touchAction: "pan-y" }} {...swipe.handlers}>
        <div
          className="grid grid-cols-7"
          style={{
            transform: `translateX(${swipe.dx}px)`,
            transition: swipe.sliding ? `transform ${SLIDE_MS}ms ease-out` : undefined,
          }}
        >
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
    </div>
  );
}

const SLIDE_MS = 180;

/**
 * Листание свайпом. Пока палец не сдвинулся заметно, жест ничей: так
 * касание по дню остаётся нажатием, а вертикальный жест — прокруткой.
 * Сдвинулся вбок — ряд едет за пальцем; отпустили дальше четверти ширины
 * или резким движением — уезжает, и с другой стороны въезжает соседний.
 */
function useSwipe(shift: (n: number) => void) {
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; at: number; id: number; horizontal: boolean | null } | null>(null);
  const swiped = useRef(false);
  const [dx, setDx] = useState(0);
  const [sliding, setSliding] = useState(false);

  const settle = () => {
    setSliding(true);
    setDx(0);
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY, at: performance.now(), id: e.pointerId, horizontal: null };
      swiped.current = false;
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const mx = e.clientX - s.x;
      const my = e.clientY - s.y;
      if (s.horizontal === null) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        s.horizontal = Math.abs(mx) > Math.abs(my);
        // Захватываем указатель только когда жест точно наш: захват с
        // первого касания увёл бы нажатие с кнопки дня на весь ряд.
        if (s.horizontal) {
          box.current?.setPointerCapture(e.pointerId);
          setSliding(false);
        }
      }
      if (s.horizontal) {
        swiped.current = true;
        setDx(mx);
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s?.horizontal) return;
      const mx = e.clientX - s.x;
      const width = box.current?.offsetWidth ?? 320;
      const fast = Math.abs(mx) / Math.max(1, performance.now() - s.at) > 0.5;
      if (Math.abs(mx) < width / 4 && !(fast && Math.abs(mx) > 30)) {
        settle();
        return;
      }
      const dir = mx < 0 ? 1 : -1;
      setSliding(true);
      setDx(-dir * width);
      setTimeout(() => {
        // Соседний отрезок ставим за краем с другой стороны без анимации
        // и уже оттуда въезжаем — так видно, откуда он пришёл.
        setSliding(false);
        shift(dir);
        setDx(dir * width);
        requestAnimationFrame(() => requestAnimationFrame(settle));
      }, SLIDE_MS);
    },
    onPointerCancel: () => {
      start.current = null;
      settle();
    },
    // После свайпа палец отпускают над каким-то днём — это не выбор дня.
    onClickCapture: (e: React.MouseEvent) => {
      if (!swiped.current) return;
      swiped.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  return { box, dx, sliding, handlers };
}
