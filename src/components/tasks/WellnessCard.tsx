"use client";

import { Icon } from "@/lib/icons";
import { daysLabel, useWellness } from "@/lib/tasks/wellness";

const WATER = "#0ea5e9";
const SLEEP = "#6366f1";

/**
 * «Здоровье» на экране «Сегодня» — одна тонкая строка: слева стаканы воды
 * с «+», справа время отбоя. Видна, только если что-то из этого включено
 * в настройках, и только для сегодняшнего дня.
 */
export function WellnessCard() {
  const { settings, glasses, problem, addGlass } = useWellness();
  if (!settings || (!settings.water_on && !settings.sleep_on)) return null;

  const goal = settings.water_goal;
  const done = glasses >= goal;
  const todayIso = ((new Date().getDay() + 6) % 7) + 1;
  const sleepToday = settings.sleep_days.includes(todayIso);
  const chip = "flex h-10 items-center gap-2 rounded-full pl-1.5";
  const chipStyle = { background: "var(--surface)", border: "1px solid var(--border)" };

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        {settings.water_on ? (
          <div className={`${chip} min-w-0 flex-1 pr-1`} style={chipStyle}>
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
              style={{ background: done ? "var(--ok)" : WATER }}
            >
              <Icon name={done ? "check" : "glass"} size={15} />
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {glasses}
              <span className="font-normal" style={{ color: "var(--muted)" }}>/{goal}</span>
            </span>
            {/* Полоска вместо подписи: сколько осталось — видно без чтения. */}
            <span className="h-1.5 min-w-[1.5rem] flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
              <span
                className="block h-full rounded-full transition-[width] duration-300"
                style={{ width: `${Math.min(100, (glasses / goal) * 100)}%`, background: done ? "var(--ok)" : WATER }}
              />
            </span>
            {glasses > 0 ? (
              <button
                onClick={() => void addGlass(-1)}
                aria-label="Убрать стакан"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base leading-none transition active:scale-90"
                style={{ background: "var(--surface-2)", color: "var(--muted)" }}
              >
                −
              </button>
            ) : null}
            <button
              onClick={() => void addGlass(1)}
              aria-label="Выпил стакан"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition active:scale-90"
              style={{ background: WATER }}
            >
              <Icon name="plus" size={16} />
            </button>
          </div>
        ) : null}

        {settings.sleep_on ? (
          <div
            className={`${chip} shrink-0 pr-3.5 ${settings.water_on ? "" : "flex-1"}`}
            style={chipStyle}
            title={daysLabel(settings.sleep_days)}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
              style={{ background: SLEEP }}
            >
              <Icon name="moon" size={15} />
            </span>
            <span className="text-sm tabular-nums" style={{ color: sleepToday ? "var(--text)" : "var(--muted)" }}>
              {sleepToday ? settings.sleep_at : "Не сегодня"}
            </span>
          </div>
        ) : null}
      </div>

      {problem ? (
        <p className="mt-1 px-2 text-[0.6875rem]" style={{ color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}
    </div>
  );
}
