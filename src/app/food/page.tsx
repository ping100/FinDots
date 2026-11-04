"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/lib/icons";
import { Button, Sheet } from "@/components/ui";
import { useFood } from "@/components/food/DataProvider";
import { FoodHeader, useFoodUI } from "@/components/food/Shell";
import { normFor, scaleItem, totals } from "@/lib/food/norms";
import { MEALS, type FoodEntry, type Meal } from "@/lib/food/types";
import { WEEKDAY_HEADS, addDays, dayLabel, dayNumber, startOfWeek, today } from "@/lib/tasks/dates";

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

export default function FoodToday() {
  const { entries, settings } = useFood();
  const { day, setDay, openAdd } = useFoodUI();
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const norm = normFor(settings);
  const now = today();

  const byDay = useMemo(() => {
    const m = new Map<string, FoodEntry[]>();
    for (const e of entries) m.set(e.day, [...(m.get(e.day) ?? []), e]);
    return m;
  }, [entries]);
  const list = byDay.get(day) ?? [];
  const sum = totals(list);

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <FoodHeader title={day === now ? "Сегодня" : dayLabel(day)} sub="Yumdots" />
      <WeekStrip day={day} onPick={setDay} byDay={byDay} goal={norm?.kcal ?? null} />

      <div className="food-card mt-3 rounded-3xl p-4">
        <Ring eaten={sum.kcal} goal={norm?.kcal ?? null} />
        {norm ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Macro label="Белки" value={sum.protein} goal={norm.protein} color="#ef4444" />
            <Macro label="Жиры" value={sum.fat} goal={norm.fat} color="#eab308" />
            <Macro label="Углеводы" value={sum.carbs} goal={norm.carbs} color="#22c55e" />
          </div>
        ) : (
          <Link
            href="/food/settings"
            className="mt-3 flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[0.8125rem] leading-snug transition active:scale-[0.98]"
            style={{ background: "var(--surface-2)" }}
          >
            <span className="text-xl">🎯</span>
            <span className="flex-1">
              <span className="block font-semibold">Узнать свою норму</span>
              <span style={{ color: "var(--muted)" }}>Укажите рост, вес и возраст, посчитаю калории и БЖУ на день</span>
            </span>
            <Icon name="chevron-right" size={16} className="opacity-40" />
          </Link>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {MEALS.map((m) => {
          const items = list.filter((e) => e.meal === m.id);
          const kcal = totals(items).kcal;
          return (
            <section key={m.id} className="food-card rounded-3xl p-3.5">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{m.emoji}</span>
                <span className="flex-1">
                  <span className="block text-[0.9375rem] font-semibold">{m.label}</span>
                  <span className="block text-[0.6875rem] tabular-nums" style={{ color: "var(--muted)" }}>
                    {items.length ? `${fmt(kcal)} ккал` : "пока ничего"}
                  </span>
                </span>
                <button
                  onClick={() => openAdd(m.id)}
                  aria-label={`Добавить в «${m.label}»`}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition active:scale-90"
                  style={{ background: "var(--surface-2)", color: "var(--accent)" }}
                >
                  <Icon name="plus" size={18} />
                </button>
              </div>
              {items.length ? (
                <ul className="mt-2 divide-y" style={{ borderColor: "var(--border)" }}>
                  {items.map((e) => (
                    <li key={e.id} style={{ borderColor: "var(--border)" }}>
                      <button onClick={() => setEditing(e)} className="flex w-full items-center gap-2 py-2 text-left">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.875rem]">{e.name}</span>
                          <span className="block text-[0.6875rem] tabular-nums" style={{ color: "var(--muted)" }}>
                            {e.grams ? `${fmt(e.grams)} г · ` : ""}Б {Math.round(e.protein)} · Ж {Math.round(e.fat)} · У {Math.round(e.carbs)}
                          </span>
                        </span>
                        <span className="text-[0.875rem] font-semibold tabular-nums">{fmt(e.kcal)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>

      {!list.length && day === now ? (
        <p className="mt-4 text-center text-[0.75rem]" style={{ color: "var(--muted)" }}>
          Нажмите «+» внизу и сфотографируйте тарелку
        </p>
      ) : null}

      <EntrySheet entry={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

/** Неделя кружками: под каждым днём точка, если в норме, и красная, если сверх. */
function WeekStrip({ day, onPick, byDay, goal }: { day: string; onPick: (d: string) => void; byDay: Map<string, FoodEntry[]>; goal: number | null }) {
  const [week, setWeek] = useState(startOfWeek(day));
  useEffect(() => setWeek(startOfWeek(day)), [day]);
  const now = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => setWeek(addDays(week, -7))} aria-label="Прошлая неделя" className="flex h-8 w-6 shrink-0 items-center justify-center opacity-50">
        <Icon name="chevron-left" size={16} />
      </button>
      <div className="grid flex-1 grid-cols-7 gap-1">
        {days.map((d, i) => {
          const kcal = totals(byDay.get(d) ?? []).kcal;
          const on = d === day;
          const future = d > now;
          const dot = kcal > 0 ? (goal && kcal > goal * 1.1 ? "#ef4444" : "#22c55e") : null;
          return (
            <button
              key={d}
              disabled={future}
              onClick={() => onPick(d)}
              className="flex flex-col items-center rounded-2xl py-1.5 transition active:scale-95 disabled:opacity-35"
              style={on ? { background: "var(--accent)", color: "#fff" } : undefined}
            >
              <span className="text-[0.625rem]" style={{ opacity: on ? 0.85 : 0.55 }}>
                {WEEKDAY_HEADS[i]}
              </span>
              <span className={`text-[0.9375rem] font-semibold ${d === now && !on ? "underline decoration-2 underline-offset-4" : ""}`}>{dayNumber(d)}</span>
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ background: dot ? (on ? "#fff" : dot) : "transparent" }} />
            </button>
          );
        })}
      </div>
      <button
        onClick={() => setWeek(addDays(week, 7))}
        disabled={addDays(week, 7) > now}
        aria-label="Следующая неделя"
        className="flex h-8 w-6 shrink-0 items-center justify-center opacity-50 disabled:opacity-15"
      >
        <Icon name="chevron-right" size={16} />
      </button>
    </div>
  );
}

/** Кольцо: сколько съедено из нормы. Сверх нормы — кольцо краснеет. */
function Ring({ eaten, goal }: { eaten: number; goal: number | null }) {
  const size = 176;
  const r = 74;
  const len = 2 * Math.PI * r;
  const share = goal ? Math.min(1, eaten / goal) : 0;
  const over = goal ? eaten - goal : 0;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <defs>
            <linearGradient id="food-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="55%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={14} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={over > 0 ? "#ef4444" : "url(#food-ring)"}
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={`${len * share} ${len}`}
            style={{ transition: "stroke-dasharray 700ms cubic-bezier(.2,.8,.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {goal ? (
            <>
              <span className="text-[2.25rem] font-bold leading-none tabular-nums">{fmt(Math.abs(goal - eaten))}</span>
              <span className="mt-1 text-[0.75rem]" style={{ color: over > 0 ? "#ef4444" : "var(--muted)" }}>
                {over > 0 ? "ккал сверх нормы" : "ккал осталось"}
              </span>
            </>
          ) : (
            <>
              <span className="text-[2.25rem] font-bold leading-none tabular-nums">{fmt(eaten)}</span>
              <span className="mt-1 text-[0.75rem]" style={{ color: "var(--muted)" }}>
                ккал съедено
              </span>
            </>
          )}
        </div>
      </div>
      {goal ? (
        <p className="mt-1 text-[0.8125rem] tabular-nums" style={{ color: "var(--muted)" }}>
          Съедено {fmt(eaten)} из {fmt(goal)} ккал
        </p>
      ) : null}
    </div>
  );
}

function Macro({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const share = goal ? Math.min(1, value / goal) : 0;
  return (
    <div>
      <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: value > goal * 1.1 ? "#ef4444" : color, transition: "width 600ms ease-out" }} />
      </div>
      <p className="mt-1 text-[0.75rem] tabular-nums">
        <span className="font-semibold">{Math.round(value)}</span>
        <span style={{ color: "var(--muted)" }}> / {goal} г</span>
      </p>
    </div>
  );
}

/** Правка записанного: вес (пересчитывает всё), приём пищи, удаление с «Вернуть». */
function EntrySheet({ entry, onClose }: { entry: FoodEntry | null; onClose: () => void }) {
  const { updateEntry, deleteEntry, restoreEntry } = useFood();
  const { toast } = useFoodUI();
  const [grams, setGrams] = useState("");
  const [meal, setMeal] = useState<Meal>("lunch");
  const [name, setName] = useState("");
  useEffect(() => {
    if (!entry) return;
    setGrams(entry.grams ? String(entry.grams) : "");
    setMeal(entry.meal);
    setName(entry.name);
  }, [entry]);
  if (!entry) return <Sheet open={false} title="" onClose={onClose}>{null}</Sheet>;
  const g = Number(grams.replace(",", "."));
  const next = g > 0 && entry.grams ? scaleItem({ ...entry, kcal: Number(entry.kcal), protein: Number(entry.protein), fat: Number(entry.fat), carbs: Number(entry.carbs) }, g) : entry;

  const save = async () => {
    const patch: Partial<FoodEntry> = { meal, name: name.trim() || entry.name };
    if (g > 0 && g !== entry.grams) Object.assign(patch, { grams: Math.round(g), kcal: next.kcal, protein: next.protein, fat: next.fat, carbs: next.carbs });
    onClose();
    await updateEntry(entry.id, patch);
  };
  const remove = async () => {
    onClose();
    await deleteEntry(entry.id);
    toast(`Удалено: ${entry.name}`, () => void restoreEntry(entry));
  };

  return (
    <Sheet open title={entry.name} onClose={onClose}>
      <input className="mb-3 w-full rounded-2xl border px-4 py-3 outline-none" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-label="Название" />
      {entry.grams ? (
        <label className="mb-3 block">
          <span className="mb-1.5 block text-sm" style={{ color: "var(--muted)" }}>
            Вес, г
          </span>
          <input inputMode="decimal" className="w-full rounded-2xl border px-4 py-3 outline-none" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }} value={grams} onChange={(e) => setGrams(e.target.value)} />
        </label>
      ) : null}
      <p className="mb-3 text-center text-[0.875rem] tabular-nums">
        <span className="text-[1.5rem] font-bold" style={{ color: "var(--accent)" }}>
          {fmt(next.kcal)}
        </span>{" "}
        ккал · Б {Math.round(next.protein)} · Ж {Math.round(next.fat)} · У {Math.round(next.carbs)}
      </p>
      <div className="mb-4 grid grid-cols-4 gap-1.5">
        {MEALS.map((m) => (
          <button
            key={m.id}
            onClick={() => setMeal(m.id)}
            className="flex flex-col items-center rounded-2xl py-2 text-[0.6875rem] transition active:scale-95"
            style={meal === m.id ? { background: "var(--accent)", color: "#fff" } : { background: "var(--surface-2)" }}
          >
            <span className="text-lg">{m.emoji}</span>
            {m.label}
          </button>
        ))}
      </div>
      <div className="space-y-2 pb-3">
        <Button onClick={() => void save()}>Сохранить</Button>
        <Button variant="ghost" onClick={() => void remove()}>
          <span style={{ color: "var(--danger)" }}>Удалить</span>
        </Button>
      </div>
    </Sheet>
  );
}
