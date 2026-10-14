"use client";

import { useMemo, useState } from "react";
import { addDays, today } from "@/lib/tasks/dates";
import { FEM_GRADIENT, PREG_TESTS, SYMPTOMS, symptomForecast, type CycleInfo, type FemPeriod } from "@/lib/fem/cycle";
import { short } from "@/lib/fem/format";
import { useFem } from "./DataProvider";
import { Pill, plural } from "./parts";

/** Как поддержать при симптоме — подсказка партнёру к прогнозу. */
export const CARE: Record<string, string> = {
  cramps: "грелка и тёплый чай будут кстати",
  bellyache: "грелка и тёплый чай будут кстати",
  headache: "тишина и приглушённый свет помогут",
  fatigue: "возьмите на себя часть дел",
  cravings: "что-нибудь вкусное к чаю — отличная идея",
  breasts: "объятия — бережнее обычного",
  backache: "лёгкий массаж спины будет приятен",
  insomnia: "спокойный вечер без экранов поможет",
  nausea: "лёгкая еда и вода под рукой",
  bloating: "лёгкий ужин и прогулка помогут",
  acne: "комплимент сейчас особенно нужен",
};

const symptomOf = (v: string) => SYMPTOMS.find((x) => x.value === v);

/**
 * «Завтра возможны: головная боль» — по тому, что повторялось в прошлых
 * циклах. У неё — с цифрами, у партнёра — с подсказкой, как помочь.
 */
export function ForecastCard({
  periods,
  logs,
  info,
  who,
  name,
}: {
  periods: FemPeriod[];
  logs: { day: string; symptoms: string[] }[];
  info: CycleInfo;
  who: "own" | "partner";
  name?: string;
}) {
  const now = today();
  const tomorrow = addDays(now, 1);
  const list = useMemo(() => symptomForecast(periods, logs, info, tomorrow), [periods, logs, info, tomorrow]);
  if (list.length === 0) return null;
  return (
    <div className="fem-card mt-3 rounded-3xl p-4">
      <p className="text-[0.9375rem] font-semibold">{who === "own" ? "Завтра возможно" : "Завтра у неё возможно"}</p>
      <p className="mb-2.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        По прошлым циклам — в тот же день цикла
      </p>
      <div className="space-y-2">
        {list.map((f) => {
          const sym = symptomOf(f.value);
          return (
            <div key={f.value} className="flex items-start gap-2.5">
              <span className="text-lg leading-6">{sym?.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{sym?.label ?? f.value}</span>
                <span className="block text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
                  {who === "partner" && CARE[f.value]
                    ? CARE[f.value]
                    : `было в ${f.hits} из ${f.of} ${plural(f.of, "цикла", "циклов", "циклов")}`}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Тест на беременность и задержка: положительный — предложить режим
 * беременности, бледная полоска — повторить, задержка после близости без
 * защиты — сделать тест (с быстрыми кнопками результата).
 */
export function PregnancyCheck({ info }: { info: CycleInfo }) {
  const { days, intimacy, saveDay, saveSettings, settings } = useFem();
  const now = today();
  const [hidden, setHidden] = useState(false);
  if (!settings || settings.pregnant_since || hidden) return null;

  // Последний тест за 3 дня.
  let last: { day: string; result: string } | null = null;
  for (let k = 0; k <= 3; k++) {
    const d = addDays(now, -k);
    const t = days.get(d)?.preg_test;
    if (t && t !== "none") {
      last = { day: d, result: t };
      break;
    }
  }

  if (last?.result === "pos") {
    return (
      <Box tone="pink">
        <p className="text-[0.9375rem] font-semibold">Тест положительный 💗</p>
        <p className="mt-1 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Включить режим беременности? Прогноз месячных встанет на паузу, а здесь будет срок в неделях и
          примерная дата родов. Обязательно покажитесь врачу — он подтвердит и уточнит срок.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => void saveSettings({ pregnant_since: now })}
            className="flex-1 rounded-2xl py-2.5 text-sm font-semibold text-white"
            style={{ background: FEM_GRADIENT }}
          >
            Включить
          </button>
          <button onClick={() => setHidden(true)} className="flex-1 rounded-2xl py-2.5 text-sm font-medium" style={{ background: "var(--surface-2)" }}>
            Не сейчас
          </button>
        </div>
      </Box>
    );
  }
  if (last?.result === "faint") {
    return (
      <Box tone="amber">
        <p className="text-[0.9375rem] font-semibold">Бледная полоска</p>
        <p className="mt-1 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Это может быть очень ранний срок. Повторите тест через 2 дня — утром, с первой порцией. Отметьте
          результат здесь.
        </p>
      </Box>
    );
  }

  if (info.late < 2 || info.hormonal) return null;
  // Была ли близость без защиты (или без отметки о защите) в этом цикле.
  const risky = info.lastStart
    ? [...intimacy].some(([d, v]) => d >= info.lastStart! && d <= now && v.kinds.includes("sex") && v.protected !== true)
    : false;
  if (last?.result === "neg") {
    return (
      <Box tone="soft">
        <p className="text-[0.9375rem] font-semibold">Тест отрицательный</p>
        <p className="mt-1 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Задержка {info.late} {plural(info.late, "день", "дня", "дней")}. Если месячные не начнутся через неделю,
          повторите тест или покажитесь врачу.
        </p>
      </Box>
    );
  }
  if (!risky && info.late < 7) return null;
  return (
    <Box tone="amber">
      <p className="text-[0.9375rem] font-semibold">
        Задержка {info.late} {plural(info.late, "день", "дня", "дней")} — стоит сделать тест
      </p>
      <p className="mt-1 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
        {risky ? "В этом цикле была близость без отметки о защите. " : ""}Тест надёжнее всего утром. Какой результат?
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {PREG_TESTS.filter((t) => t.value !== "none").map((t) => (
          <Pill key={t.value} on={false} onClick={() => void saveDay(now, { preg_test: t.value })}>
            <span>{t.emoji}</span>
            {t.label}
          </Pill>
        ))}
      </div>
      <p className="mt-2 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        Ожидались ~{info.nextStart ? short(info.nextStart) : "—"}
      </p>
    </Box>
  );
}

function Box({ tone, children }: { tone: "pink" | "amber" | "soft"; children: React.ReactNode }) {
  const bg =
    tone === "pink"
      ? "color-mix(in srgb, #f472b6 16%, var(--surface))"
      : tone === "amber"
        ? "color-mix(in srgb, #f59e0b 14%, var(--surface))"
        : "var(--surface)";
  return (
    <div className="animate-lift mt-3 rounded-3xl border p-4" style={{ background: bg, borderColor: "var(--border)" }}>
      {children}
    </div>
  );
}
