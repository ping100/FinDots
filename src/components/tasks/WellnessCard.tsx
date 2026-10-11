"use client";

import { Icon } from "@/lib/icons";
import { daysLabel, useWellness } from "@/lib/tasks/wellness";

const WATER = "#0ea5e9";
const SLEEP = "#6366f1";

/**
 * «Здоровье» на экране «Сегодня»: стаканы воды с кнопкой «+1» и
 * напоминание об отбое. Видна, только если что-то из этого включено в
 * настройках, и только для сегодняшнего дня.
 */
export function WellnessCard() {
  const { settings, glasses, problem, addGlass } = useWellness();
  if (!settings || (!settings.water_on && !settings.sleep_on)) return null;

  const goal = settings.water_goal;
  const done = glasses >= goal;
  const todayIso = ((new Date().getDay() + 6) % 7) + 1;
  const sleepToday = settings.sleep_days.includes(todayIso);

  return (
    <div className="mt-3 overflow-hidden rounded-2xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      {settings.water_on ? (
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
              style={{ background: WATER }}
            >
              <Icon name={done ? "check" : "glass"} size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Вода</span>
              <span className="block text-[0.6875rem]" style={{ color: done ? "var(--ok)" : "var(--muted)" }}>
                {done ? `Цель выполнена — ${glasses} из ${goal}` : `${glasses} из ${goal} стаканов`}
              </span>
            </span>
            {glasses > 0 ? (
              <button
                onClick={() => void addGlass(-1)}
                aria-label="Убрать стакан"
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none transition active:scale-90"
                style={{ background: "var(--surface-2)", color: "var(--muted)" }}
              >
                −
              </button>
            ) : null}
            <button
              onClick={() => void addGlass(1)}
              aria-label="Выпил стакан"
              className="flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-white transition active:scale-90"
              style={{ background: WATER }}
            >
              <Icon name="plus" size={15} />
              стакан
            </button>
          </div>
          {/* По делению на стакан: видно, сколько осталось, без подсчёта в уме. */}
          <div className="mt-2 flex gap-1">
            {Array.from({ length: Math.min(goal, 16) }, (_, i) => {
              const filled = goal <= 16 ? i < glasses : i < Math.round((glasses / goal) * 16);
              return (
                <span
                  key={i}
                  className="h-1.5 flex-1 rounded-full transition-colors duration-300"
                  style={{ background: filled ? WATER : "var(--surface-2)" }}
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {settings.sleep_on ? (
        <div
          className="flex items-center gap-2.5 px-3 py-2.5"
          style={{ borderTop: settings.water_on ? "1px solid var(--border)" : undefined }}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: SLEEP }}
          >
            <Icon name="moon" size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Сон</span>
            <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              {sleepToday
                ? `Отбой в ${settings.sleep_at}${settings.sleep_prep_min ? ` · напомню за ${settings.sleep_prep_min} мин` : ""}`
                : `Сегодня без напоминания · ${daysLabel(settings.sleep_days)}`}
            </span>
          </span>
        </div>
      ) : null}

      {problem ? (
        <p className="px-3 pb-2 text-[0.6875rem]" style={{ color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}
    </div>
  );
}
