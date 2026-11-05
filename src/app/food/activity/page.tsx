"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import { useFood } from "@/components/food/DataProvider";
import { FoodHeader, useFoodUI } from "@/components/food/Shell";
import { WorkoutSheet, useBurnedByDay } from "@/components/food/Workouts";
import { normFor } from "@/lib/food/norms";
import type { Workout } from "@/lib/food/types";
import { kindOf } from "@/lib/food/workouts";
import { addDays, dayLabel, today } from "@/lib/tasks/dates";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

/**
 * Активность: тренировки и шаги за день. Сожжённое прибавляется к норме
 * еды на «Сегодня». Данные с часов не подтягиваются (сайту их не отдают),
 * поэтому цифру с трекера вписывают вручную.
 */
export default function FoodActivity() {
  const { workouts, settings, deleteWorkout, restoreWorkout } = useFood();
  const { day, setDay, toast } = useFoodUI();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Workout | null>(null);
  const now = today();
  const burnedBy = useBurnedByDay();
  const list = useMemo(() => workouts.filter((w) => w.day === day).sort((a, b) => a.created_at.localeCompare(b.created_at)), [workouts, day]);
  const burned = burnedBy.get(day) ?? 0;
  const norm = normFor(settings);

  // Неделя: сколько сожжено за последние 7 дней до выбранного.
  const week = Array.from({ length: 7 }, (_, i) => addDays(day, i - 6));
  const weekSum = week.reduce((s, d) => s + (burnedBy.get(d) ?? 0), 0);
  const weekMax = Math.max(1, ...week.map((d) => burnedBy.get(d) ?? 0));
  const weekCount = workouts.filter((w) => w.kind !== "steps" && week.includes(w.day)).length;

  const remove = async (w: Workout) => {
    setEditing(null);
    await deleteWorkout(w.id);
    toast(`Удалено: ${kindOf(w.kind).label}`, () => void restoreWorkout(w));
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <FoodHeader title="Активность" sub="Yumdots" />

      <div className="flex items-center justify-between">
        <button onClick={() => setDay(addDays(day, -1))} aria-label="Предыдущий день" className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--surface-2)" }}>
          <Icon name="chevron-left" size={16} />
        </button>
        <span className="text-[0.9375rem] font-semibold first-letter:uppercase">{day === now ? "Сегодня" : day === addDays(now, -1) ? "Вчера" : dayLabel(day)}</span>
        <button
          onClick={() => setDay(addDays(day, 1))}
          disabled={day >= now}
          aria-label="Следующий день"
          className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30"
          style={{ background: "var(--surface-2)" }}
        >
          <Icon name="chevron-right" size={16} />
        </button>
      </div>

      <div className="food-card mt-3 rounded-3xl p-4 text-center">
        <span className="text-3xl">🔥</span>
        <p className="mt-1 text-[2.25rem] font-bold leading-none tabular-nums">{fmt(burned)}</p>
        <p className="mt-1 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
          ккал сожжено
        </p>
        {norm ? (
          <p className="mt-2 rounded-2xl px-3 py-2 text-[0.75rem] leading-snug" style={{ background: "var(--surface-2)" }}>
            {burned > 0 ? (
              <>
                Норма еды на этот день: <b className="tabular-nums">{fmt(norm.kcal)} + {fmt(burned)} = {fmt(norm.kcal + burned)} ккал</b>
              </>
            ) : (
              <>Всё, что сожжёте на тренировке, прибавится к норме еды ({fmt(norm.kcal)} ккал)</>
            )}
          </p>
        ) : null}
        <button
          onClick={() => setAdding(true)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl py-3 text-[0.9375rem] font-semibold text-white transition active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #fb923c, #ef4444)", boxShadow: "0 8px 20px -10px rgba(249,115,22,.8)" }}
        >
          <Icon name="plus" size={18} /> Тренировка или шаги
        </button>
      </div>

      {list.length ? (
        <ul className="food-card mt-3 rounded-3xl px-4 py-1">
          {list.map((w, i) => {
            const k = kindOf(w.kind);
            const sub =
              w.kind === "steps"
                ? `${fmt(w.steps ?? 0)} шагов`
                : [w.minutes ? `${w.minutes} мин` : null, w.source === "tracker" ? "с трекера" : null].filter(Boolean).join(" · ") || "тренировка";
            return (
              <li key={w.id} style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
                <button onClick={() => setEditing(w)} className="flex w-full items-center gap-3 py-3 text-left">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xl" style={{ background: "var(--surface-2)" }}>
                    {k.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-medium">{k.label}</span>
                    <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                      {sub}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.9375rem] font-semibold tabular-nums" style={{ color: "#f97316" }}>
                    −{fmt(Number(w.kcal))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-6 px-6 text-center text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          {day === now ? "Сегодня тренировок пока нет." : "В этот день тренировок нет."} Добавьте по виду и времени, цифрой с часов или шагами.
        </p>
      )}

      <div className="food-card mt-3 rounded-3xl p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-[0.875rem] font-semibold">За 7 дней</p>
          <p className="text-[0.75rem] tabular-nums" style={{ color: "var(--muted)" }}>
            {fmt(weekSum)} ккал · {weekCount} {weekCount % 10 === 1 && weekCount % 100 !== 11 ? "тренировка" : weekCount % 10 >= 2 && weekCount % 10 <= 4 && (weekCount % 100 < 12 || weekCount % 100 > 14) ? "тренировки" : "тренировок"}
          </p>
        </div>
        <div className="flex h-20 items-end gap-1.5">
          {week.map((d) => {
            const v = burnedBy.get(d) ?? 0;
            return (
              <button key={d} onClick={() => setDay(d)} className="flex h-full flex-1 flex-col items-center justify-end gap-1" aria-label={`${dayLabel(d)}: ${fmt(v)} ккал`}>
                <span
                  className="w-full rounded-md"
                  style={{ height: `${(v / weekMax) * 100}%`, minHeight: v ? 4 : 2, background: d === day ? "#f97316" : v ? "color-mix(in srgb, #f97316 45%, transparent)" : "var(--surface-2)" }}
                />
                <span className="text-[0.625rem] tabular-nums" style={{ color: d === day ? "var(--text)" : "var(--muted)" }}>
                  {Number(d.slice(8))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <WorkoutSheet
        open={adding || !!editing}
        day={day}
        editing={editing}
        onClose={() => (setAdding(false), setEditing(null))}
        onSaved={(t) => toast(t)}
        onDelete={editing ? () => void remove(editing) : undefined}
      />
    </div>
  );
}
