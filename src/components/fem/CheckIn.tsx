"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { FEM_GRADIENT, FLOWS, MOODS, PHASE_COLOR, SEX_TAGS, SYMPTOMS } from "@/lib/fem/cycle";
import { Sheet } from "@/components/ui";
import { useFem } from "./DataProvider";
import { DayLog, heartOf, IntimacyHeart, plural, type LogSection } from "./parts";

type Topic = "flow" | "mood" | "body" | "love" | "more";

/** Темы дня: заголовок листа, подсказка и какие разделы дневника в нём. */
const TOPICS: Record<Topic, { title: string; hint: string; only: LogSection[] }> = {
  flow: { title: "Как идут месячные?", hint: "Выберите — лист закроется сам", only: ["flow"] },
  mood: { title: "Какое настроение?", hint: "Отметьте, как вы сейчас, — за день можно несколько раз", only: ["mood"] },
  body: { title: "Как самочувствие?", hint: "Можно выбрать несколько", only: ["symptoms"] },
  love: { title: "Близость", hint: "Общее видно партнёру, личное — только вам", only: ["intimacy"] },
  more: { title: "Ещё за сегодня", hint: "Выделения, тесты, температура, вес, заметка", only: ["more", "note"] },
};

/**
 * «Как вы сегодня?» на главной: плитка на каждую тему — Настроение,
 * Самочувствие, Близость, Ещё (и Месячные в их дни). На плитке видно, что
 * уже отмечено; нажатие открывает только эту тему. Утром — настроение,
 * вечером — близость, без опросов. Полный дневник — в календаре.
 */
export function CheckIn({ day, showFlow }: { day: string; showFlow: boolean }) {
  const { days, intimacy } = useFem();
  const [topic, setTopic] = useState<Topic | null>(null);
  const entry = days.get(day);
  const intim = intimacy.get(day) ?? null;

  // Где ответ один (месячные, настроение) — после выбора лист закрывается сам.
  const auto = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (auto.current && clearTimeout(auto.current)), []);
  const onSingle = () => {
    if (auto.current) clearTimeout(auto.current);
    auto.current = setTimeout(() => setTopic(null), 420);
  };

  const flow = FLOWS.find((f) => f.value === entry?.flow);
  const mood = MOODS.find((m) => m.value === entry?.mood);
  const symptoms = (entry?.symptoms ?? []).map((v) => SYMPTOMS.find((s) => s.value === v)).filter((x) => !!x);
  const heart = heartOf(intim, entry?.tags);
  const shared = intim?.kinds.length ? intim : null;
  const privateOnly = !shared && (entry?.tags ?? []).some((t) => SEX_TAGS.some((s) => s.value === t));
  const extra =
    (entry?.tags ?? []).filter((t) => /^(d|o|a):/.test(t)).length + (entry?.meds.length ?? 0) + (entry?.lh ? 1 : 0) +
    (entry?.temp != null ? 1 : 0) + (entry?.weight != null ? 1 : 0) + (entry?.preg_test ? 1 : 0) + (entry?.note ? 1 : 0);

  const tiles: { key: Topic; label: string; icon: React.ReactNode; value: string | null }[] = [
    {
      key: "mood",
      // Несколько отметок за день — счётчик у названия, значение — последнее.
      label: (entry?.mood_log?.length ?? 0) > 1 ? `Настроение · ${entry!.mood_log!.length}` : "Настроение",
      icon: mood ? mood.emoji : "🙂",
      value: mood?.label ?? null,
    },
    {
      key: "body",
      label: "Симптомы",
      icon: symptoms[0]?.emoji ?? "🩺",
      value:
        symptoms.length === 0
          ? null
          : symptoms.length === 1
            ? symptoms[0]!.label
            : `${symptoms.length} ${plural(symptoms.length, "отметка", "отметки", "отметок")}`,
    },
    {
      key: "love",
      label: "Близость",
      icon: heart ? <IntimacyHeart kind={heart} size={22} /> : "💗",
      value: shared
        ? shared.kinds.includes("sex")
          ? shared.protected === false
            ? "Без защиты"
            : "С защитой"
          : "Отмечено"
        : privateOnly
          ? "Личное"
          : null,
    },
    { key: "more", label: "Ещё", icon: "＋", value: extra ? `${extra} ${plural(extra, "отметка", "отметки", "отметок")}` : null },
  ];
  const cur = topic ? TOPICS[topic] : null;

  return (
    <div className="fem-card mt-3 rounded-3xl p-4">
      <p className="text-[0.9375rem] font-semibold">Как вы сегодня?</p>
      <p className="mt-0.5 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
        Нажмите, что хотите отметить, — в любое время дня
      </p>

      {showFlow ? (
        <button
          onClick={() => setTopic("flow")}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition active:scale-[0.98]"
          style={{
            background: flow ? `color-mix(in srgb, ${PHASE_COLOR.period} 16%, var(--surface))` : "var(--surface-2)",
            border: `1px solid ${flow ? PHASE_COLOR.period : "transparent"}`,
          }}
        >
          <span className="flex" style={{ color: PHASE_COLOR.period }}>
            <Icon name="drop" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.875rem] font-semibold">Месячные</span>
            <span className="block text-[0.75rem]" style={{ color: flow ? "var(--text)" : "var(--muted)" }}>
              {flow ? `Выделения: ${flow.label.toLowerCase()}` : "Отметьте, какие сегодня выделения"}
            </span>
          </span>
          <Icon name="chevron-right" size={16} className="opacity-40" />
        </button>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {tiles.map((t) => {
          const set = !!t.value;
          return (
            <button
              key={t.key}
              onClick={() => setTopic(t.key)}
              aria-label={`${t.label}: ${t.value ?? "не отмечено"}`}
              className="flex min-w-0 items-center gap-2.5 rounded-2xl px-2.5 py-2.5 text-left transition active:scale-95"
              style={{
                background: set ? "color-mix(in srgb, #ec4899 10%, var(--surface))" : "var(--surface-2)",
                border: `1px solid ${set ? "color-mix(in srgb, #ec4899 45%, transparent)" : "transparent"}`,
              }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[1.2rem] leading-none"
                style={{ background: "var(--surface)", opacity: set ? 1 : 0.6, color: "var(--muted)" }}
              >
                {t.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-semibold">{t.label}</span>
                <span
                  className="block truncate text-[0.6875rem] leading-tight"
                  style={{ color: set ? "var(--accent)" : "var(--muted)", fontWeight: set ? 600 : 400 }}
                >
                  {t.value ?? "не отмечено"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Sheet
        open={cur !== null}
        title={cur?.title ?? ""}
        onClose={() => setTopic(null)}
        footer={
          cur ? (
            <button
              onClick={() => setTopic(null)}
              className="w-full rounded-2xl py-3 text-sm font-semibold text-white"
              style={{ background: FEM_GRADIENT }}
            >
              Готово
            </button>
          ) : undefined
        }
      >
        {cur && topic ? (
          <div key={topic} className="animate-lift pb-2">
            <p className="mb-3 text-[0.75rem]" style={{ color: "var(--muted)" }}>
              {cur.hint}
            </p>
            <DayLog day={day} showFlow={showFlow} only={cur.only} onSingle={onSingle} />
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
