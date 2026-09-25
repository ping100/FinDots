"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Icon } from "@/lib/icons";
import {
  WEEKDAY_HEADS,
  addDays,
  addMonths,
  dayNumber,
  isSameMonth,
  monthGrid,
  monthTitle,
  today,
} from "@/lib/tasks/dates";
import type { DropTarget } from "@/lib/tasks/types";

/** Сколько дней в ленте в каждую сторону от выбранного. Дальше — через месяц. */
const SPAN = 183;
/** Дней на экране одновременно. */
const VISIBLE = 7;

function weekdayHead(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAY_HEADS[(new Date(y, m - 1, d).getDay() + 6) % 7];
}

function DayCell({
  date,
  selected,
  isToday,
  loaded,
  faded,
  withHead,
  onSelect,
}: {
  date: string;
  selected: boolean;
  isToday: boolean;
  /** В этот день есть незавершённые задачи. */
  loaded: boolean;
  /** День соседнего месяца в сетке — он есть, но приглушён. */
  faded?: boolean;
  /** Подпись дня недели над числом: в ленте дни не стоят под общей шапкой. */
  withHead?: boolean;
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
      className="flex snap-start flex-col items-center gap-1 py-1"
    >
      {withHead ? (
        <span className="text-[0.625rem]" style={{ color: "var(--muted)" }}>
          {weekdayHead(date)}
        </span>
      ) : null}
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
  // Месяц в раскрытом виде и месяц в заголовке ленты: листание не меняет
  // выбранный день — можно посмотреть вперёд и вернуться, ничего не
  // перевыбрав.
  const [month, setMonth] = useState(selected);
  const [stripTitle, setStripTitle] = useState(selected);
  const t = today();

  const strip = useStrip(selected, setStripTitle);

  const goToday = () => {
    onSelect(t);
    setMonth(t);
    strip.scrollTo(t, true);
  };

  const pick = (date: string) => {
    onSelect(date);
    // Выбрали день в раскрытом месяце — сворачиваем к ленте на этом дне.
    if (expanded) setExpanded(false);
  };

  // Лента появляется заново после раскрытого месяца — ставим её на
  // выбранный день, иначе она открылась бы с самого начала, полгода назад.
  const { scrollTo } = strip;
  useLayoutEffect(() => {
    if (!expanded) scrollTo(selected, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только при сворачивании
  }, [expanded]);

  const title = expanded ? month : stripTitle;
  const nearToday = expanded ? isSameMonth(month, t) : strip.showsToday;

  return (
    <div className="select-none">
      <div className="flex items-center justify-between pb-1">
        <button
          onClick={() => {
            if (!expanded) setMonth(stripTitle);
            setExpanded((v) => !v);
          }}
          className="flex items-center gap-1 rounded-xl py-1 text-sm font-medium"
          aria-expanded={expanded}
          aria-label={expanded ? "Свернуть до недели" : "Раскрыть месяц"}
        >
          {monthTitle(title)}
          <Icon
            name="chevron-down"
            size={16}
            style={{ transform: expanded ? "rotate(180deg)" : undefined }}
          />
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => (expanded ? setMonth(addMonths(month, -1)) : strip.page(-1))}
            aria-label={expanded ? "Предыдущий месяц" : "Неделя назад"}
            className="rounded-full p-1.5"
            style={{ color: "var(--muted)" }}
          >
            <Icon name="chevron-left" size={18} />
          </button>
          {/* Кнопка «сегодня» нужна только когда ушли от него далеко. */}
          {!nearToday || selected !== t ? (
            <button
              onClick={goToday}
              className="rounded-full px-2 py-1 text-xs font-medium"
              style={{ color: "var(--accent)" }}
            >
              Сегодня
            </button>
          ) : null}
          <button
            onClick={() => (expanded ? setMonth(addMonths(month, 1)) : strip.page(1))}
            aria-label={expanded ? "Следующий месяц" : "Неделя вперёд"}
            className="rounded-full p-1.5"
            style={{ color: "var(--muted)" }}
          >
            <Icon name="chevron-right" size={18} />
          </button>
        </div>
      </div>

      {expanded ? (
        <MonthGrid
          month={month}
          selected={selected}
          today={t}
          loadedDates={loadedDates}
          onSelect={pick}
          onFlip={(n) => setMonth((m) => addMonths(m, n))}
        />
      ) : (
        // Лента дней листается пальцем по одному дню, с разгоном — обычная
        // прокрутка телефона, привязанная к границам дней. Своей анимации
        // нет: её не заклинит посередине.
        <div
          ref={strip.box}
          onScroll={strip.onScroll}
          className="grid snap-x snap-mandatory auto-cols-[calc(100%/7)] grid-flow-col overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {strip.days.map((date) => (
            <DayCell
              key={date}
              date={date}
              selected={date === selected}
              isToday={date === t}
              loaded={loadedDates.has(date)}
              withHead
              onSelect={pick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Лента дней: полгода назад и вперёд от выбранного. Дальше человек почти
 * не листает, а если нужно — есть раскрытый месяц; когда выбранный день
 * уходит за край, лента перестраивается вокруг него.
 */
function useStrip(selected: string, onTitle: (date: string) => void) {
  const box = useRef<HTMLDivElement>(null);
  const [center, setCenter] = useState(selected);
  const [showsToday, setShowsToday] = useState(true);
  const t = today();

  const days = useMemo(
    () => Array.from({ length: SPAN * 2 + 1 }, (_, i) => addDays(center, i - SPAN)),
    [center],
  );

  // Выбранный день вне ленты (выбрали в месяце далеко) — перестраиваем её.
  const outside = !days.includes(selected);
  useEffect(() => {
    if (outside) setCenter(selected);
  }, [outside, selected]);

  const cell = () => (box.current?.clientWidth ?? 0) / VISIBLE;

  const scrollTo = useCallback(
    (date: string, smooth: boolean) => {
      const index = days.indexOf(date);
      if (index < 0 || !box.current) return;
      // Нужный день — посередине экрана.
      box.current.scrollTo({ left: (index - 3) * cell(), behavior: smooth ? "smooth" : "auto" });
    },
    [days],
  );

  // Первый показ и перестройка ленты — сразу на выбранном дне, до отрисовки.
  useLayoutEffect(() => {
    scrollTo(selected, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только при смене ленты
  }, [center]);

  const frame = useRef(0);
  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = box.current;
      if (!el) return;
      const first = Math.round(el.scrollLeft / cell());
      const middle = days[Math.min(days.length - 1, first + 3)];
      onTitle(middle);
      const todayIndex = days.indexOf(t);
      setShowsToday(todayIndex >= first && todayIndex < first + VISIBLE);
    });
  };

  const page = (n: number) => box.current?.scrollBy({ left: n * VISIBLE * cell(), behavior: "smooth" });

  return { box, days, onScroll, scrollTo, page, showsToday };
}

function MonthGrid({
  month,
  selected,
  today: t,
  loadedDates,
  onSelect,
  onFlip,
}: {
  month: string;
  selected: string;
  today: string;
  loadedDates: Set<string>;
  onSelect: (date: string) => void;
  onFlip: (n: number) => void;
}) {
  // Месяц перелистывается свайпом: без анимации «за пальцем» — просто
  // смахнули, и открылся соседний. Касание по дню остаётся выбором.
  const start = useRef<{ x: number; y: number } | null>(null);
  const flipped = useRef(false);

  return (
    <div
      className="grid grid-cols-7"
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY };
        flipped.current = false;
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) {
          flipped.current = true;
          onFlip(dx < 0 ? 1 : -1);
        }
      }}
      onPointerCancel={() => (start.current = null)}
      // Смахнули месяц — палец отпустили над каким-то днём, но это не выбор.
      onClickCapture={(e) => {
        if (!flipped.current) return;
        flipped.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {WEEKDAY_HEADS.map((head) => (
        <span key={head} className="pb-0.5 text-center text-[0.625rem]" style={{ color: "var(--muted)" }}>
          {head}
        </span>
      ))}
      {monthGrid(month).map((date) => (
        <DayCell
          key={date}
          date={date}
          selected={date === selected}
          isToday={date === t}
          loaded={loadedDates.has(date)}
          faded={!isSameMonth(date, month)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
