"use client";

import { useEffect, useRef, useState } from "react";
import { FEM_GRADIENT, FLOWS, MOODS, SYMPTOMS } from "@/lib/fem/cycle";
import { Sheet } from "@/components/ui";
import { useFem } from "./DataProvider";
import { DayLog, heartOf, IntimacyHeart, type LogSection } from "./parts";

/** Шаги опроса: вопрос и какие разделы дневника на нём. */
const STEPS: { key: string; title: string; hint: string; only: LogSection[] }[] = [
  { key: "flow", title: "Как идут месячные?", hint: "Выберите — и сразу дальше", only: ["flow"] },
  { key: "mood", title: "Какое настроение?", hint: "Выберите — и сразу дальше", only: ["mood"] },
  { key: "body", title: "Как самочувствие?", hint: "Можно несколько", only: ["symptoms"] },
  { key: "love", title: "Близость", hint: "Если не было — просто «Дальше»", only: ["intimacy"] },
  { key: "more", title: "Что-то ещё?", hint: "Необязательно: выделения, тесты, температура, заметка", only: ["more", "note"] },
];

/**
 * «Как вы сегодня?» на главной: короткая карточка с тем, что уже отмечено,
 * а сами отметки — мини-опросом по шагам в листе. Полный дневник остаётся
 * в календаре.
 */
export function CheckIn({ day, showFlow }: { day: string; showFlow: boolean }) {
  const { days, intimacy } = useFem();
  const steps = STEPS.filter((s) => s.key !== "flow" || showFlow);
  const [step, setStep] = useState<number | null>(null);
  const entry = days.get(day);
  const intim = intimacy.get(day) ?? null;

  // Выбрали месячные или настроение — через миг сами переходим дальше.
  const auto = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (auto.current && clearTimeout(auto.current)), []);
  const next = () => setStep((s) => (s === null ? null : s + 1 < steps.length ? s + 1 : null));
  const onSingle = () => {
    if (auto.current) clearTimeout(auto.current);
    auto.current = setTimeout(next, 380);
  };

  // Что уже отмечено сегодня — короткими плашками.
  const chips: { key: string; icon: React.ReactNode; label: string }[] = [];
  const flow = FLOWS.find((f) => f.value === entry?.flow);
  if (flow) chips.push({ key: "flow", icon: "🩸", label: flow.label });
  const mood = MOODS.find((m) => m.value === entry?.mood);
  if (mood) chips.push({ key: "mood", icon: mood.emoji, label: mood.label });
  for (const v of entry?.symptoms ?? []) {
    const x = SYMPTOMS.find((s) => s.value === v);
    if (x) chips.push({ key: v, icon: x.emoji, label: x.label });
  }
  const heart = heartOf(intim);
  if (heart) chips.push({ key: "love", icon: <IntimacyHeart kind={heart} size={14} />, label: "Близость" });
  const extra =
    (entry?.tags.length ?? 0) + (entry?.meds.length ?? 0) + (entry?.lh ? 1 : 0) + (entry?.temp != null ? 1 : 0) +
    (entry?.weight != null ? 1 : 0) + (entry?.preg_test ? 1 : 0) + (entry?.note ? 1 : 0);
  const shown = chips.slice(0, 5);
  const rest = chips.length - shown.length + extra;
  const empty = chips.length === 0 && extra === 0;

  const cur = step !== null ? steps[step] : null;

  return (
    <div className="fem-card mt-3 rounded-3xl p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[0.9375rem] font-semibold">Как вы сегодня?</span>
          <span className="mt-0.5 block text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
            {empty ? "Пара нажатий — и прогноз станет точнее" : "Отмечено сегодня"}
          </span>
        </span>
        {!empty ? (
          <button
            onClick={() => setStep(0)}
            className="shrink-0 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition active:scale-95"
            style={{ background: "var(--surface-2)", color: "var(--accent)" }}
          >
            Изменить
          </button>
        ) : null}
      </div>

      {empty ? (
        <button
          onClick={() => setStep(0)}
          className="fem-shine mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[0.9375rem] font-semibold text-white transition active:scale-[0.98]"
          style={{ background: FEM_GRADIENT, boxShadow: "0 10px 22px -12px rgba(236,72,153,0.7)" }}
        >
          ✍️ Отметить самочувствие
        </button>
      ) : (
        <button onClick={() => setStep(0)} className="mt-2.5 flex w-full flex-wrap gap-1.5 text-left" aria-label="Изменить отметки за сегодня">
          {shown.map((c) => (
            <span key={c.key} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem]" style={{ background: "var(--surface-2)" }}>
              <span className="flex items-center">{c.icon}</span>
              {c.label}
            </span>
          ))}
          {rest > 0 ? (
            <span className="rounded-full px-2.5 py-1 text-[0.75rem]" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
              +{rest}
            </span>
          ) : null}
        </button>
      )}

      <Sheet
        open={cur !== null}
        title={cur?.title ?? ""}
        onClose={() => setStep(null)}
        footer={
          cur && step !== null ? (
            <div className="flex gap-2">
              {step > 0 ? (
                <button
                  onClick={() => setStep(step - 1)}
                  className="rounded-2xl px-4 py-3 text-sm font-medium"
                  style={{ background: "var(--surface-2)" }}
                >
                  Назад
                </button>
              ) : null}
              <button
                onClick={next}
                className="flex-1 rounded-2xl py-3 text-sm font-semibold text-white"
                style={{ background: FEM_GRADIENT }}
              >
                {step + 1 < steps.length ? "Дальше" : "Готово"}
              </button>
            </div>
          ) : undefined
        }
      >
        {cur && step !== null ? (
          <div key={cur.key} className="animate-lift pb-2">
            {/* Где мы в опросе — точками, как всё в Dots. */}
            <div className="mb-3 flex items-center gap-1.5">
              {steps.map((s, i) => (
                <button
                  key={s.key}
                  onClick={() => setStep(i)}
                  aria-label={s.title}
                  className="h-2 rounded-full transition-all"
                  style={{ width: i === step ? 22 : 8, background: i <= step ? "#ec4899" : "var(--surface-2)" }}
                />
              ))}
              <span className="ml-auto text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                {cur.hint}
              </span>
            </div>
            <DayLog day={day} showFlow={showFlow} only={cur.only} onSingle={onSingle} />
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
