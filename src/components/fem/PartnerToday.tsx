"use client";

import { useEffect, useState } from "react";
import { MoodIcon, SymptomIcon } from "./FemIcons";
import { Icon } from "@/lib/icons";
import { PHASE_COLOR, type CycleInfo, type Goal, type Phase } from "@/lib/fem/cycle";
import { chanceOf } from "@/lib/fem/phrases";
import { adviceFor } from "@/lib/fem/partnerAdvice";
import { today } from "@/lib/tasks/dates";
import { plural } from "./parts";
import type { Likes } from "@/lib/fem/together";

/**
 * «Алиса сегодня» у партнёра: её день в цифрах (фаза, до месячных, шанс
 * беременности, её настроение и симптомы, если делится), а по нажатию —
 * «Как её понять и поддержать»: что с ней сейчас, что скоро, что делать и
 * чего не делать, что можно сказать (lib/fem/partnerAdvice).
 */
export function PartnerToday({
  name,
  info,
  mood,
  symptoms,
  goal,
  likes,
  votes,
  onAbout,
}: {
  name: string;
  info: CycleInfo;
  mood: { value: string; label: string; emoji: string } | null;
  symptoms: { value: string; label: string; emoji: string }[];
  goal: Goal | null;
  likes?: Likes;
  votes?: Record<string, number>;
  onAbout: () => void;
}) {
  // Раскрыто ли — запоминаем на телефоне.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(localStorage.getItem("fem.partnerToday.open") === "1");
    } catch {
      // Нет памяти — свёрнуто.
    }
  }, []);
  const toggle = () =>
    setOpen((v) => {
      try {
        localStorage.setItem("fem.partnerToday.open", v ? "0" : "1");
      } catch {
        // Не запомнили — не страшно.
      }
      return !v;
    });
  const phase = info.phase;
  if (!phase) return null;
  const chance = chanceOf(phase);
  const real = symptoms.filter((s) => s.value !== "ok");
  const advice = adviceFor({
    phase,
    info,
    mood: mood?.value ?? null,
    symptoms: real.map((s) => s.value),
    goal,
    today: today(),
    likes,
    votes,
  });
  const { todo, notTodo } = advice;

  const when: [string, string] | null = info.current
    ? ["Месячные", `${info.cycleDay}-й день`]
    : info.late > 0
      ? ["Задержка", `${info.late} ${plural(info.late, "день", "дня", "дней")}`]
      : info.daysToNext != null
        ? ["До месячных", `${info.daysToNext} ${plural(info.daysToNext, "день", "дня", "дней")}`]
        : null;

  return (
    <div className="fem-card mt-3 rounded-3xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-semibold">{name} сегодня</p>
          <button onClick={onAbout} className="mt-0.5 flex items-center gap-1.5 text-[0.75rem]" style={{ color: "var(--muted)" }}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PHASE_COLOR[phase] }} />
            {info.cycleDay ? `${info.cycleDay}-й день · ` : ""}
            <span className="underline decoration-dotted underline-offset-2">о фазе</span>
          </button>
        </div>
      </div>

      {/* Её день в цифрах. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {when ? <Stat label={when[0]} value={when[1]} color={info.late > 0 ? PHASE_COLOR.late : PHASE_COLOR.period} /> : null}
        <Stat label="Шанс беременности" value={chance.label.toLowerCase()} color={chance.level >= 2 ? PHASE_COLOR.ovulation : "var(--muted)"} />
        {mood ? (
          <Stat
            label="Настроение"
            value={
              <span className="flex items-center gap-1.5">
                <MoodIcon value={mood.value} size={18} />
                {mood.label.toLowerCase()}
              </span>
            }
            color="#f59e0b"
          />
        ) : null}
        {real.length ? (
          <Stat
            label="Самочувствие"
            value={
              <span className="flex items-center gap-1.5">
                <span className="flex -space-x-1">
                  {real.slice(0, 3).map((s) => (
                    <SymptomIcon key={s.value} value={s.value} size={18} />
                  ))}
                </span>
                {real.length === 1 ? real[0].label.toLowerCase() : `${real.length} ${plural(real.length, "отметка", "отметки", "отметок")}`}
              </span>
            }
            color="#a855f7"
          />
        ) : null}
      </div>

      {/* Советы — свёрнуты: сводка короткая, раскрыть одним нажатием. */}
      <button
        onClick={toggle}
        aria-expanded={open}
        className="mt-3 flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left transition active:scale-[0.98]"
        style={{ background: "var(--surface-2)" }}
      >
        <span className="flex -space-x-1">
          <Dot good />
          <Dot />
        </span>
        <span className="min-w-0 flex-1 text-[0.8125rem] font-medium">
          {open ? "Свернуть" : "Как её понять и поддержать"}
        </span>
        <Icon name="chevron-down" size={16} className="shrink-0 opacity-50 transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open ? (
        <div className="animate-expand">
          <div>
            <Section title="Что с ней сейчас" icon="bulb" color="#f59e0b">
              {advice.understand.map((t) => (
                <p key={t} className="text-[0.8125rem] leading-snug">
                  {t}
                </p>
              ))}
            </Section>
            {advice.soon.length ? (
              <div
                className="mt-3 space-y-1 rounded-2xl px-3 py-2.5"
                style={{ background: "color-mix(in srgb, #f59e0b 14%, var(--surface))" }}
              >
                <p className="text-[0.75rem] font-semibold" style={{ color: "#b45309" }}>
                  Скоро
                </p>
                {advice.soon.map((t) => (
                  <p key={t} className="text-[0.8125rem] leading-snug">
                    {t}
                  </p>
                ))}
              </div>
            ) : null}
            <List title="Что делать" items={todo} good />
            <List title="Чего не делать" items={notTodo} />
            <Section title="Что можно сказать" icon="heart" color="#ec4899">
              <div className="flex flex-col gap-1.5">
                {advice.say.map((t) => (
                  <span
                    key={t}
                    className="self-start rounded-2xl rounded-bl-md px-3 py-2 text-[0.8125rem] leading-snug"
                    style={{ background: "color-mix(in srgb, #ec4899 12%, var(--surface))" }}
                  >
                    «{t}»
                  </span>
                ))}
              </div>
            </Section>
            <p className="mt-3 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
              Подсказки меняются каждый день. Лучший совет — спросить её саму, чего ей сейчас хочется.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: React.ReactNode; color: string }) {
  return (
    <div className="min-w-0 rounded-2xl px-3 py-2" style={{ background: "var(--surface-2)" }}>
      <span className="flex items-center gap-1.5 text-[0.625rem] font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="mt-0.5 block text-[0.875rem] font-semibold leading-tight">{value}</span>
    </div>
  );
}

function List({ title, items, good }: { title: string; items: string[]; good?: boolean }) {
  if (!items.length) return null;
  const tone = good ? "#14b8a6" : "#f43f5e";
  return (
    <div className="mt-3.5">
      <p className="mb-1.5 text-[0.8125rem] font-semibold">{title}</p>
      <ul className="space-y-1.5">
        {items.map((t) => (
          <li key={t} className="flex items-start gap-2.5 text-[0.8125rem] leading-snug">
            <span
              className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
              style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}
            >
              <Icon name={good ? "check" : "close"} size={11} />
            </span>
            <span className="min-w-0 flex-1">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Dot({ good }: { good?: boolean }) {
  const tone = good ? "#14b8a6" : "#f43f5e";
  return (
    <span
      className="flex h-5 w-5 items-center justify-center rounded-full"
      style={{ background: `color-mix(in srgb, ${tone} 18%, var(--surface))`, color: tone, boxShadow: "0 0 0 2px var(--surface-2)" }}
    >
      <Icon name={good ? "check" : "close"} size={11} />
    </span>
  );
}

function Section({ title, icon, color, children }: { title: string; icon: string; color: string; children: React.ReactNode }) {
  return (
    <div className="mt-3.5">
      <p className="mb-1.5 flex items-center gap-2 text-[0.8125rem] font-semibold">
        <span
          className="flex h-[18px] w-[18px] items-center justify-center rounded-full"
          style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
        >
          <Icon name={icon} size={11} />
        </span>
        {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
