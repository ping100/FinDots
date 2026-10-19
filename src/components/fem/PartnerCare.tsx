"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";
import { FEM_GRADIENT, type CycleInfo, type Goal, type Phase } from "@/lib/fem/cycle";
import { adviceFor, isGentle } from "@/lib/fem/partnerAdvice";
import { factOfDay, phrasesOfDay, prepFor, weekKey, weekTasks, type PartnerState } from "@/lib/fem/partnerCare";
import type { Likes } from "@/lib/fem/together";
import { today } from "@/lib/tasks/dates";
import { useFem } from "./DataProvider";

/** Сколько оценок помнить: старые уходят, свежие важнее. */
const MAX_VOTES = 80;

/**
 * «Совет на сегодня» у партнёра: совет с «Помогло / Не то», факт дня,
 * что ей написать (отправить в чат одной кнопкой) и, перед месячными или
 * её лучшими днями, что подготовить заранее.
 */
export function CareCard({
  info,
  phase,
  mood,
  symptoms,
  goal,
  likes,
}: {
  info: CycleInfo;
  phase: Phase;
  mood: string | null;
  symptoms: string[];
  goal: Goal | null;
  likes: Likes;
}) {
  const { partner, setPartnerState, sendSignal } = useFem();
  const state: PartnerState = partner?.state ?? {};
  const day = today();
  const advice = adviceFor({ phase, info, mood, symptoms, goal, today: day, likes, votes: state.votes });
  const tip = advice.todo[0] ?? null;
  const [voted, setVoted] = useState<{ tip: string; v: number } | null>(null);
  const gentle = isGentle(mood, symptoms);
  const phrases = phrasesOfDay(phase, day, gentle);
  const [idx, setIdx] = useState(0);
  const [sent, setSent] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const phrase = phrases[idx % Math.max(phrases.length, 1)];
  const fact = factOfDay(phase, day);
  const prep = prepFor(info, likes, day);
  const prepDone = prep && state.prep?.key === prep.key ? state.prep.done : [];

  const vote = (text: string, v: number) => {
    setVoted({ tip: text, v });
    setPartnerState((prev) => {
      const entries = Object.entries({ ...(prev.votes ?? {}), [text]: v }).filter(([k]) => k !== text);
      entries.push([text, v]);
      return { ...prev, votes: Object.fromEntries(entries.slice(-MAX_VOTES)) };
    });
  };

  const send = async () => {
    if (!phrase || sending) return;
    setSending(true);
    try {
      await sendSignal("msg", phrase);
      setSent(phrase);
    } finally {
      setSending(false);
    }
  };

  const togglePrep = (item: string) => {
    if (!prep) return;
    setPartnerState((prev) => {
      const done = prev.prep?.key === prep.key ? prev.prep.done : [];
      return { ...prev, prep: { key: prep.key, done: done.includes(item) ? done.filter((x) => x !== item) : [...done, item] } };
    });
  };

  return (
    <div className="fem-card mt-3 rounded-3xl p-4">
      {/* Совет */}
      <p className="flex items-center gap-2 text-[0.8125rem] font-semibold" style={{ color: "var(--muted)" }}>
        <span className="text-base">💡</span> Совет на сегодня
      </p>
      {tip ? (
        <>
          <p key={tip} className="animate-lift mt-1.5 text-[1rem] font-semibold leading-snug">
            {tip}
          </p>
          {voted?.tip === tip && voted.v === 1 ? (
            <p className="animate-lift mt-2 text-[0.75rem]" style={{ color: "var(--accent)" }}>
              Спасибо! Буду чаще советовать похожее 👌
            </p>
          ) : (
            <div className="mt-2.5 flex gap-2">
              <VoteButton emoji="👍" label="Помогло" onClick={() => vote(tip, 1)} />
              <VoteButton emoji="👎" label="Не то" onClick={() => vote(tip, -1)} />
            </div>
          )}
          {voted && voted.v === -1 && voted.tip !== tip ? (
            <p className="animate-lift mt-2 text-[0.75rem]" style={{ color: "var(--muted)" }}>
              Понял, такое больше не предложу. Вот другой совет
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-1.5 text-[0.875rem]" style={{ color: "var(--muted)" }}>
          Спросите её саму, чего ей сегодня хочется
        </p>
      )}

      {/* Факт дня */}
      {fact ? (
        <div className="mt-3.5 rounded-2xl px-3 py-2.5" style={{ background: "var(--surface-2)" }}>
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--muted)" }}>
            🧠 Факт дня
          </p>
          <p className="mt-0.5 text-[0.8125rem] leading-snug">{fact}</p>
        </div>
      ) : null}

      {/* Что сказать */}
      {phrase ? (
        <div className="mt-3.5">
          <p className="text-[0.75rem] font-semibold" style={{ color: "var(--muted)" }}>
            💬 Что ей написать
          </p>
          <p
            key={phrase}
            className="animate-lift mt-1.5 inline-block rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[0.875rem] leading-snug"
            style={{ background: "color-mix(in srgb, #ec4899 12%, var(--surface))" }}
          >
            {phrase}
          </p>
          <div className="mt-2 flex gap-2">
            {sent === phrase ? (
              <span className="flex flex-1 items-center justify-center rounded-2xl py-2.5 text-[0.8125rem] font-semibold" style={{ color: "var(--accent)" }}>
                Отправлено ✓
              </span>
            ) : (
              <button
                onClick={() => void send()}
                disabled={sending}
                className="flex-1 rounded-2xl py-2.5 text-[0.8125rem] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
                style={{ background: FEM_GRADIENT }}
              >
                Отправить ей
              </button>
            )}
            {phrases.length > 1 ? (
              <button
                onClick={() => setIdx((i) => i + 1)}
                className="flex items-center gap-1.5 rounded-2xl px-3.5 py-2.5 text-[0.8125rem] font-semibold transition active:scale-[0.98]"
                style={{ background: "var(--surface-2)" }}
              >
                <Icon name="repeat" size={14} /> Другая
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Подготовиться заранее */}
      {prep ? (
        <div className="mt-3.5 rounded-2xl px-3 py-3" style={{ background: "color-mix(in srgb, #f59e0b 13%, var(--surface))" }}>
          <p className="text-[0.8125rem] font-semibold" style={{ color: "#b45309" }}>
            🛒 Подготовиться заранее
          </p>
          <p className="mt-0.5 text-[0.75rem]" style={{ color: "var(--muted)" }}>
            {prep.title}
          </p>
          <ul className="mt-2 space-y-1">
            {prep.items.map((item) => (
              <li key={item}>
                <Check text={item} done={prepDone.includes(item)} onClick={() => togglePrep(item)} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** «Добрые дела недели»: 6 маленьких дел, новые по понедельникам. */
export function WeekCard() {
  const { partner, setPartnerState } = useFem();
  const day = today();
  const key = weekKey(day);
  const tasks = weekTasks(day);
  const st = partner?.state?.week;
  const done = st?.key === key ? st.done.filter((t) => tasks.includes(t)) : [];
  const all = done.length === tasks.length;

  const toggle = (t: string) =>
    setPartnerState((prev) => {
      const cur = prev.week?.key === key ? prev.week.done : [];
      return { ...prev, week: { key, done: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] } };
    });

  return (
    <div className="fem-card mt-3 rounded-3xl p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.9375rem] font-semibold">✅ Добрые дела недели</p>
        <span className="text-[0.75rem] font-semibold tabular-nums" style={{ color: all ? "var(--accent)" : "var(--muted)" }}>
          {done.length} из {tasks.length}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(done.length / tasks.length) * 100}%`, background: FEM_GRADIENT }} />
      </div>
      <ul className="mt-3 space-y-1">
        {tasks.map((t) => (
          <li key={t}>
            <Check text={t} done={done.includes(t)} onClick={() => toggle(t)} />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[0.6875rem]" style={{ color: all ? "var(--accent)" : "var(--muted)" }}>
        {all ? "🎉 Все дела недели сделаны. Она точно это заметила!" : "Новые дела появятся в понедельник"}
      </p>
    </div>
  );
}

function VoteButton({ emoji, label, onClick }: { emoji: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition active:scale-95"
      style={{ background: "var(--surface-2)" }}
    >
      <span>{emoji}</span>
      {label}
    </button>
  );
}

function Check({ text, done, onClick }: { text: string; done: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={done} className="flex w-full items-start gap-2.5 rounded-xl py-1 text-left text-[0.8125rem] leading-snug transition active:scale-[0.99]">
      <span
        className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md transition"
        style={done ? { background: FEM_GRADIENT, color: "#fff" } : { border: "1.5px solid var(--border)", background: "var(--surface)" }}
      >
        {done ? <Icon name="check" size={11} /> : null}
      </span>
      <span className="min-w-0 flex-1" style={done ? { color: "var(--muted)", textDecoration: "line-through" } : undefined}>
        {text}
      </span>
    </button>
  );
}
