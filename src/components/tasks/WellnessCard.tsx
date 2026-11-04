"use client";

import { Icon } from "@/lib/icons";
import { daysLabel, useWellness } from "@/lib/tasks/wellness";

const SLEEP = "#6366f1";

/**
 * Сон на экране «Сегодня» — одна тонкая строка со временем отбоя. Видна,
 * только если сон включён, и только для сегодняшнего дня. Вода — в Yumdots.
 */
export function WellnessCard() {
  const { settings, problem } = useWellness();
  // Вода переехала в Yumdots — здесь только сон.
  if (!settings || !settings.sleep_on) return null;
  const todayIso = ((new Date().getDay() + 6) % 7) + 1;
  const sleepToday = settings.sleep_days.includes(todayIso);
  const chip = "flex h-10 items-center gap-2 rounded-full pl-1.5";
  const chipStyle = { background: "var(--surface)", border: "1px solid var(--border)" };

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        {settings.sleep_on ? (
          <div
            className={`${chip} flex-1 pr-3.5`}
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
