"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Sheet, inputClass, inputStyle } from "@/components/ui";
import type { Workout } from "@/lib/food/types";
import { KINDS, STEPS_BASE, kindOf, stepsKcal, weightOr, workoutKcal } from "@/lib/food/workouts";
import { useFood } from "./DataProvider";

type Mode = "time" | "tracker" | "steps";

const MODES: { id: Mode; label: string }[] = [
  { id: "time", label: "Вид и время" },
  { id: "tracker", label: "С трекера" },
  { id: "steps", label: "Шаги" },
];

const num = (s: string) => {
  const n = Number(s.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

/** Сожжено за день: сумма тренировок и шагов. */
export function burnedOn(workouts: Workout[], day: string) {
  return workouts.filter((w) => w.day === day).reduce((s, w) => s + Number(w.kcal), 0);
}

/** Сожжено по дням — для недели и итогов. */
export function useBurnedByDay() {
  const { workouts } = useFood();
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const w of workouts) m.set(w.day, (m.get(w.day) ?? 0) + Number(w.kcal));
    return m;
  }, [workouts]);
}

/**
 * Добавить или поправить тренировку. Три способа: выбрать вид и минуты
 * (посчитаем по весу), вписать калории с часов или шаги за день.
 */
export function WorkoutSheet({
  open,
  day,
  editing,
  onClose,
  onSaved,
  onDelete,
}: {
  open: boolean;
  day: string;
  editing: Workout | null;
  onClose: () => void;
  onSaved: (text: string) => void;
  onDelete?: () => void;
}) {
  const { settings, workouts, addWorkout, updateWorkout } = useFood();
  const weight = weightOr(settings?.weight_kg);
  const [mode, setMode] = useState<Mode>("time");
  const [kind, setKind] = useState("walk");
  const [minutes, setMinutes] = useState("");
  const [kcal, setKcal] = useState("");
  const [steps, setSteps] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProblem(null);
    if (editing) {
      setMode(editing.source === "calc" ? "time" : editing.source);
      setKind(editing.kind === "steps" ? "walk" : editing.kind);
      setMinutes(editing.minutes ? String(editing.minutes) : "");
      setKcal(String(Math.round(Number(editing.kcal))));
      setSteps(editing.steps ? String(editing.steps) : "");
    } else {
      setMode("time");
      setKind("walk");
      setMinutes("");
      setKcal("");
      setSteps("");
    }
  }, [open, editing]);

  // Шаги за день — одна запись: если уже есть, её и правим.
  const stepsRow = editing?.kind === "steps" ? editing : workouts.find((w) => w.day === day && w.kind === "steps") ?? null;
  useEffect(() => {
    if (open && mode === "steps" && !editing && stepsRow?.steps) setSteps(String(stepsRow.steps));
  }, [open, mode, editing, stepsRow]);

  const calc =
    mode === "time" ? workoutKcal(kindOf(kind), num(minutes), weight) : mode === "steps" ? stepsKcal(num(steps), weight) : Math.round(num(kcal));
  const ok = mode === "time" ? num(minutes) > 0 : mode === "steps" ? num(steps) > 0 : num(kcal) > 0 && num(kcal) <= 10000;

  const save = async () => {
    if (!ok || saving) return;
    setSaving(true);
    setProblem(null);
    const row: Omit<Workout, "id" | "user_id" | "created_at"> =
      mode === "steps"
        ? { day, kind: "steps", minutes: null, steps: Math.round(num(steps)), kcal: calc, source: "steps", note: null }
        : {
            day,
            kind,
            minutes: num(minutes) ? Math.round(num(minutes)) : null,
            steps: null,
            kcal: calc,
            source: mode === "time" ? "calc" : "tracker",
            note: null,
          };
    try {
      const target = editing ?? (mode === "steps" ? stepsRow : null);
      if (target) await updateWorkout(target.id, row);
      else await addWorkout(row);
      onSaved(mode === "steps" ? `Шаги: ${fmt(num(steps))} · −${fmt(calc)} ккал` : `${kindOf(kind).emoji} ${kindOf(kind).label}: −${fmt(calc)} ккал`);
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const chip = (on: boolean) => (on ? { background: "var(--accent)", color: "#fff" } : { background: "var(--surface-2)" });

  return (
    <Sheet
      open={open}
      title={editing ? "Тренировка" : "Добавить активность"}
      onClose={onClose}
      footer={
        <div className="space-y-2 pb-2">
          <Button onClick={() => void save()} disabled={!ok || saving}>
            {saving ? "Сохраняю…" : ok ? `Сохранить · ${fmt(calc)} ккал` : "Сохранить"}
          </Button>
          {onDelete ? (
            <Button variant="ghost" onClick={onDelete}>
              <span style={{ color: "var(--danger)" }}>Удалить</span>
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="pb-3">
        {!editing ? (
          <div className="mb-3 flex gap-1 rounded-2xl p-1" style={{ background: "var(--surface-2)" }} role="tablist">
            {MODES.map((m) => (
              <button
                key={m.id}
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => setMode(m.id)}
                className="flex-1 rounded-xl py-1.5 text-[0.8125rem] font-medium"
                style={mode === m.id ? { background: "var(--surface)", boxShadow: "0 1px 4px rgba(0,0,0,.08)" } : { color: "var(--muted)" }}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : null}

        {problem ? (
          <p className="mb-3 rounded-2xl px-3.5 py-2.5 text-[0.8125rem]" style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}>
            {problem}
          </p>
        ) : null}

        {mode !== "steps" ? (
          <>
            <p className="mb-1.5 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
              Что за тренировка
            </p>
            <div className="mb-3 grid grid-cols-3 gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setKind(k.id)}
                  aria-pressed={kind === k.id}
                  className="flex flex-col items-center rounded-2xl px-1 py-2 text-center text-[0.6875rem] font-medium leading-tight transition active:scale-95"
                  style={chip(kind === k.id)}
                >
                  <span className="mb-0.5 text-xl leading-none">{k.emoji}</span>
                  {k.label}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {mode === "time" ? (
          <>
            <p className="mb-1.5 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
              Сколько минут
            </p>
            <input inputMode="numeric" className={`${inputClass} mb-2`} style={inputStyle} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Например, 45" />
            <div className="mb-3 flex flex-wrap gap-1.5">
              {[15, 30, 45, 60, 90].map((m) => (
                <button key={m} onClick={() => setMinutes(String(m))} className="rounded-full px-3 py-1.5 text-[0.8125rem]" style={chip(num(minutes) === m)}>
                  {m} мин
                </button>
              ))}
            </div>
            <p className="text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
              Считаю для веса {fmt(weight)} кг{settings?.weight_kg ? " из настроек" : ": вес не указан в настройках, поэтому беру средний"}. Если на часах цифра точнее, выберите «С трекера».
            </p>
          </>
        ) : null}

        {mode === "tracker" ? (
          <>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[0.75rem]" style={{ color: "var(--muted)" }}>
                  Активные калории
                </span>
                <input inputMode="numeric" className={inputClass} style={inputStyle} value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="320" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.75rem]" style={{ color: "var(--muted)" }}>
                  Минут, если знаете
                </span>
                <input inputMode="numeric" className={inputClass} style={inputStyle} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="45" />
              </label>
            </div>
            <p className="text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
              На часах это «Активные калории» (Apple Watch) или «Калории тренировки». Общие калории за день сюда не пишите: базовый расход уже есть в норме.
            </p>
          </>
        ) : null}

        {mode === "steps" ? (
          <>
            <p className="mb-1.5 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
              Шагов за день
            </p>
            <input inputMode="numeric" className={`${inputClass} mb-2`} style={inputStyle} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="Например, 8000" />
            <div className="mb-3 flex flex-wrap gap-1.5">
              {[5000, 8000, 10000, 15000].map((n) => (
                <button key={n} onClick={() => setSteps(String(n))} className="rounded-full px-3 py-1.5 text-[0.8125rem]" style={chip(num(steps) === n)}>
                  {fmt(n)}
                </button>
              ))}
            </div>
            <p className="text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
              {stepsRow && !editing ? "Шаги за этот день уже есть, сохраню новое число вместо старого. " : ""}
              Считаю только шаги сверх обычных {fmt(STEPS_BASE)}: их уже учитывает норма. Вес {fmt(weight)} кг. Шаги смотрите в «Здоровье» на iPhone или в приложении часов.
            </p>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}
