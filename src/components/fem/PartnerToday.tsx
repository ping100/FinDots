"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { PHASE_COLOR, type CycleInfo, type Goal, type Phase } from "@/lib/fem/cycle";
import { chanceOf } from "@/lib/fem/phrases";
import { CARE } from "./Insights";
import { plural } from "./parts";

/** Что делать — по фазе. */
const DO: Record<Phase, string[]> = {
  period: ["Тёплый чай, грелка, плед — мелочи, которые сейчас много значат", "Возьмите на себя часть дел по дому", "Предложите спокойный вечер дома"],
  follicular: ["Предложите что-то новое: прогулку, спорт, поездку", "Самое время для совместных планов"],
  fertile: ["Отличное время для свидания", "Комплименты и внимание сейчас особенно приятны", "Предложите что-то активное вдвоём"],
  ovulation: ["Проведите день вместе — у неё пик энергии", "Скажите, как она вам нравится"],
  luteal: ["Чуть больше заботы и терпения", "Что-нибудь вкусное к чаю будет кстати", "Обнимите просто так"],
  late: ["Будьте рядом и сохраняйте спокойствие", "Если она захочет — сходите за тестом вместе"],
  protected: ["Простое «как ты?» — уже забота", "Придумайте что-то приятное вместе"],
  pregnant: ["Чуть больше заботы и внимания"],
};
/** Чего не делать — по фазе. */
const DONT: Record<Phase, string[]> = {
  period: ["Не шутите про «эти дни»", "Не планируйте тяжёлых нагрузок и долгих прогулок", "Не обижайтесь, если ей хочется побыть одной"],
  follicular: ["Не отмахивайтесь от её идей — сейчас их много", "Не превращайте вечер в рутину"],
  fertile: ["Не забывайте о защите, если не планируете детей", "Не отменяйте планы в последний момент"],
  ovulation: ["Не забывайте о защите, если не планируете детей", "Не проводите вечер каждый в своём телефоне"],
  luteal: ["Не спорьте по мелочам — эмоции сейчас ярче", "Не говорите «это у тебя гормоны»", "Не комментируйте еду и вес"],
  late: ["Не торопите с тестом и выводами", "Не показывайте тревогу — ей и так непросто"],
  protected: ["Не забывайте спрашивать, как она"],
  pregnant: ["Не давите советами"],
};
/** Чего не делать — по её симптомам сегодня. */
const SYMPTOM_DONT: Record<string, string> = {
  cramps: "Не зовите на тренировку или долгую прогулку",
  bellyache: "Не предлагайте тяжёлую еду",
  headache: "Не включайте громкую музыку и яркий свет",
  fatigue: "Не нагружайте её делами",
  breasts: "Не обнимайте слишком крепко",
  cravings: "Не комментируйте, что она ест",
  insomnia: "Не планируйте поздний вечер",
  acne: "Не обращайте внимания на кожу",
  nausea: "Не готовьте ничего с резким запахом",
  backache: "Не просите помочь с тяжёлым",
};
const LOW_MOODS = new Set(["sad", "irritated", "anxious", "down", "apathy", "swings", "confused"]);

/**
 * «Алиса сегодня» у партнёра: её день в цифрах (фаза, до месячных, шанс
 * беременности, её настроение и симптомы, если делится) и два коротких
 * списка — что делать и чего не делать. Советы — по фазе, её симптомам и
 * настроению.
 */
export function PartnerToday({
  name,
  info,
  mood,
  symptoms,
  goal,
  onAbout,
}: {
  name: string;
  info: CycleInfo;
  mood: { value: string; label: string; emoji: string } | null;
  symptoms: { value: string; label: string; emoji: string }[];
  goal: Goal | null;
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
  const lowMood = !!mood && LOW_MOODS.has(mood.value);

  // Без повторов по смыслу: совет, у которого есть общее слово с уже
  // взятым («грелка», «чай»), пропускаем.
  const words = (t: string) => new Set(t.toLowerCase().replace(/[^а-яё ]/g, " ").split(/\s+/).filter((w) => w.length >= 5));
  const uniq = (list: string[]) => {
    const out: string[] = [];
    for (const t of list) {
      const w = words(t);
      if (out.some((o) => [...words(o)].some((x) => w.has(x)))) continue;
      out.push(t);
      if (out.length === 4) break;
    }
    return out;
  };
  const conceive = goal === "conceive";
  const todo = uniq([
    ...real.map((s) => CARE[s.value]).filter(Boolean).map((t) => t[0].toUpperCase() + t.slice(1)),
    ...(lowMood ? ["Выслушайте, не перебивая"] : []),
    ...(conceive && (phase === "fertile" || phase === "ovulation") ? ["Лучшие дни для зачатия — побудьте вместе"] : []),
    ...DO[phase],
  ]);
  const notTodo = uniq([
    ...real.map((s) => SYMPTOM_DONT[s.value]).filter(Boolean),
    ...(lowMood ? ["Не давайте советов, пока она не попросит"] : []),
    ...DONT[phase].filter((t) => !(conceive && t.includes("защит"))),
    ...(conceive ? ["Не давите разговорами о беременности"] : []),
  ]);

  const when: [string, string] | null = info.current
    ? ["Месячные", `${info.cycleDay}-й день`]
    : info.late > 0
      ? ["Задержка", `${info.late} ${plural(info.late, "день", "дня", "дней")}`]
      : info.daysToNext != null
        ? ["До месячных", `${info.daysToNext} ${plural(info.daysToNext, "день", "дня", "дней")}`]
        : null;

  return (
    <div className="fem-card mb-4 rounded-3xl p-4">
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
        {mood ? <Stat label="Настроение" value={`${mood.emoji} ${mood.label.toLowerCase()}`} color="#f59e0b" /> : null}
        {real.length ? (
          <Stat
            label="Самочувствие"
            value={real.length === 1 ? `${real[0].emoji} ${real[0].label.toLowerCase()}` : real.slice(0, 2).map((s) => s.emoji).join(" ") + ` ${real.length} ${plural(real.length, "отметка", "отметки", "отметок")}`}
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
          {open ? "Свернуть советы" : `Что делать и чего не делать · ${todo.length + notTodo.length}`}
        </span>
        <Icon name="chevron-down" size={16} className="shrink-0 opacity-50 transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open ? (
        <div className="animate-expand">
          <div>
            <List title="Что делать" items={todo} good />
            <List title="Чего не делать" items={notTodo} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
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
