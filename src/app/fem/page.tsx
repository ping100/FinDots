"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import { addDays, today } from "@/lib/tasks/dates";
import { FEM_GRADIENT, PHASE_COLOR, PHASE_TEXT, cycleHealth, cycleInfo, signalsFrom } from "@/lib/fem/cycle";
import { OwnTogether } from "@/components/fem/Together";
import { ForecastCard, PregnancyCheck } from "@/components/fem/Insights";
import { PartnerJoin } from "@/components/fem/PartnerShare";
import { long, range, short } from "@/lib/fem/format";
import { useFem } from "@/components/fem/DataProvider";
import { FemHeader } from "@/components/fem/Shell";
import { CycleRing, DayHero, plural, useLearned } from "@/components/fem/parts";
import { CheckIn } from "@/components/fem/CheckIn";

/**
 * Главный экран FemDots: фраза дня, кольцо цикла, одна главная кнопка
 * («начались» / «закончились»), ближайшие даты и самочувствие за сегодня.
 */
export default function FemToday() {
  const { settings, periods, days, partner, share, startPeriod, endPeriod, saveDay } = useFem();
  const now = today();
  const info = useMemo(
    () => cycleInfo(periods, settings!, now, signalsFrom(days, settings)),
    [periods, settings, days, now],
  );
  const health = useMemo(() => cycleHealth(periods), [periods]);
  const logs = useMemo(() => [...days.values()].map((d) => ({ day: d.day, symptoms: d.symptoms })), [days]);
  const goal = settings!.goal;
  const method = settings!.method;
  const [busy, setBusy] = useState(false);
  const phase = info.phase ? PHASE_TEXT[info.phase] : null;
  // Окно этого цикла уже прошло — показываем ближайшее, следующего.
  const fw = useMemo(() => {
    if (!info.fertileStart || !info.fertileEnd || !info.ovulation) return null;
    const shiftBy = info.fertileEnd < now ? info.cycleLength : 0;
    return {
      from: addDays(info.fertileStart, shiftBy),
      to: addDays(info.fertileEnd, shiftBy),
      ovulation: addDays(info.ovulation, shiftBy),
      now: now >= addDays(info.fertileStart, shiftBy) && now <= addDays(info.fertileEnd, shiftBy),
      shifted: shiftBy > 0,
    };
  }, [info, now]);

  const act = async () => {
    setBusy(true);
    if (info.current) await endPeriod(info.current.id, now);
    else await startPeriod(now);
    setBusy(false);
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <FemHeader title={long(now)} sub="FemDots" />
      {/* Ведёте свой цикл и при этом смотрите чужой — переход сюда. */}
      {partner ? <PartnerJoin /> : null}

      {info.phase ? <DayHero phase={info.phase} day={now} who="own" goal={goal} /> : null}

      <div className="fem-card rounded-[28px] px-4 pb-5 pt-6">
        <CycleRing info={info} size={232} />

        {phase && info.phase ? (
          // Термин — мелко, под кольцом: главное уже сказано фразой дня.
          <p className="mt-3 text-center text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
            <span className="font-semibold" style={{ color: "var(--text)" }}>
              {phase.title}
            </span>{" "}
            · {phase.hint}
          </p>
        ) : null}

        {info.pregnancy ? null : (
        <button
          onClick={act}
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[0.9375rem] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
          style={
            info.current
              ? { background: "var(--surface-2)", color: "var(--text)" }
              : { background: FEM_GRADIENT, color: "#fff", boxShadow: "0 12px 26px -12px rgba(236,72,153,0.75)" }
          }
        >
          <Icon name={info.current ? "check" : "drop"} size={18} />
          {info.hormonal
            ? info.current
              ? "Кровотечение закончилось"
              : "Началось кровотечение"
            : info.current
              ? "Месячные закончились"
              : "Начались месячные"}
        </button>
        )}
        {info.pregnancy ? null : (
        <p className="mt-2 text-center text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          Другой день — отметьте в{" "}
          <Link href="/fem/calendar" replace className="underline">
            календаре
          </Link>
        </p>
        )}
      </div>

      <FirstSteps partner={share?.partner_name ?? null} />

      <PregnancyCheck info={info} />

      {info.pregnancy ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Fact
            color={PHASE_COLOR.pregnant}
            label="Срок"
            value={`${info.pregnancy.weeks} нед. ${info.pregnancy.days} дн.`}
            hint="от первого дня последних месячных"
          />
          <Fact
            color="#f472b6"
            label="Дата родов"
            value={`~${short(info.pregnancy.due)}`}
            hint="по правилу Негеле — уточнит врач"
          />
        </div>
      ) : info.hormonal ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Fact
            color={PHASE_COLOR.period}
            label="Кровотечение отмены"
            value={info.nextRange ? range(info.nextRange[0], info.nextRange[1]) : "по графику нет"}
            hint={info.nextRange ? "по схеме упаковки" : "на этом методе бывает нерегулярным"}
          />
          <MethodFact />
        </div>
      ) : info.nextStart ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Fact
            color={PHASE_COLOR.period}
            label="Следующие месячные"
            value={info.late > 0 ? "задержка" : info.nextRange ? range(info.nextRange[0], info.nextRange[1]) : `~${short(info.nextStart)}`}
            hint={
              info.late > 0
                ? `ожидались ~${short(info.nextStart)}`
                : info.daysToNext === 0
                  ? "вероятнее всего сегодня"
                  : `вероятнее ~${short(info.nextStart)}, через ${info.daysToNext} ${plural(info.daysToNext ?? 0, "день", "дня", "дней")}`
            }
          />
          {fw ? (
            <Fact
              color={PHASE_COLOR.fertile}
              label={goal === "conceive" ? (fw.now ? "Лучшие дни — сейчас" : "Лучшие дни для зачатия") : fw.now ? "Фертильное окно — сейчас" : "Фертильное окно"}
              value={range(fw.from, fw.to)}
              hint={
                info.ovulationBy && !fw.shifted
                  ? `овуляция ${short(fw.ovulation)} ✓ ${info.ovulationBy === "lh" ? "по тесту" : info.ovulationBy === "temp" ? "по температуре" : "по выделениям"}`
                  : `овуляция ~${short(fw.ovulation)}`
              }
            />
          ) : null}
        </div>
      ) : null}

      {method === "coc" || method === "pop" ? (
        <div className="fem-card mt-3 flex items-center gap-3 rounded-3xl px-4 py-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xl" style={{ background: "var(--surface-2)" }}>
            💊
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-semibold">
              {info.pack?.inBreak
                ? "Перерыв — таблетки не нужны"
                : info.pack
                  ? `Таблетка ${info.pack.day} из ${info.pack.active}`
                  : "Таблетка сегодня"}
            </span>
            <span className="block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
              {info.pack?.inBreak
                ? `Новая упаковка — через ${info.pack.length - info.pack.day + 1} ${plural(info.pack.length - info.pack.day + 1, "день", "дня", "дней")}`
                : method === "pop"
                  ? "Мини-пили — строго в одно и то же время"
                  : "Пропустили — смотрите инструкцию или спросите врача"}
            </span>
          </span>
          {!info.pack?.inBreak ? (
            <button
              onClick={() => void saveDay(now, { pill: !days.get(now)?.pill })}
              className="shrink-0 rounded-full px-3.5 py-2 text-[0.8125rem] font-semibold transition active:scale-95"
              style={
                days.get(now)?.pill
                  ? { background: "var(--surface-2)", color: "var(--accent)" }
                  : { background: FEM_GRADIENT, color: "#fff" }
              }
            >
              {days.get(now)?.pill ? "Выпила ✓" : "Выпила"}
            </button>
          ) : null}
        </div>
      ) : null}

      {health?.some((h) => !h.ok) ? (
        <Link href="/fem/stats" replace className="fem-card mt-3 flex items-center gap-3 rounded-3xl px-4 py-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xl" style={{ background: "color-mix(in srgb, #fbbf24 22%, transparent)" }}>
            🩺
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-semibold">Стоит показать врачу</span>
            <span className="block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
              {health.find((h) => !h.ok)!.detail} — подробнее в «Итогах»
            </span>
          </span>
          <Icon name="chevron-right" size={16} className="opacity-30" />
        </Link>
      ) : null}

      <ForecastCard periods={periods} logs={logs} info={info} who="own" />

      <OwnTogether />

      <CheckIn day={now} showFlow={!!info.current || (info.daysToNext != null && info.daysToNext <= 2)} />

      <p className="mt-4 px-3 text-center text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
        {info.hormonal
          ? "На гормональной контрацепции прогноз — по схеме метода. Это не медицинский совет."
          : `Прогноз — оценка по вашим прошлым циклам (${info.cycleLength} ${plural(info.cycleLength, "день", "дня", "дней")} в среднем)${info.ovulationBy ? " и подтверждённой овуляции" : ""}. Это не способ предохранения и не медицинский совет.`}
      </p>
    </div>
  );
}

/**
 * «Как здесь всё устроено» — один раз, при первых заходах: где что
 * отмечать и куда смотреть. Закрывается кнопкой «Понятно» навсегда.
 */
function FirstSteps({ partner }: { partner: string | null }) {
  const [known, learn] = useLearned("fem.hint.today");
  if (known) return null;
  const steps: [string, React.ReactNode][] = [
    ["🩸", <>Начались месячные — нажмите кнопку выше. Другой день — в <Link href="/fem/calendar" replace className="underline">календаре</Link>.</>],
    ["✍️", "Ниже — «Как вы сегодня?»: короткий опрос, пара нажатий в день делает прогноз точнее."],
    ["📊", <>Как прошёл цикл и что в норме — во вкладке <Link href="/fem/stats" replace className="underline">«Итоги»</Link>.</>],
    partner
      ? ["💌", `${partner} подключён — просьбы и статус дня ниже, в карточке «Вы и ${partner}».`]
      : ["💌", <>Хотите, чтобы партнёр видел прогноз? Код для него — в <Link href="/fem/settings" replace className="underline">настройках</Link>.</>],
  ];
  return (
    <div className="fem-card animate-lift mt-3 rounded-3xl p-4">
      <p className="text-[0.9375rem] font-semibold">Как здесь всё устроено</p>
      <div className="mt-2.5 space-y-2">
        {steps.map(([emoji, text], i) => (
          <p key={i} className="flex gap-2.5 text-[0.8125rem] leading-snug">
            <span className="text-base leading-5">{emoji}</span>
            <span className="min-w-0 flex-1">{text}</span>
          </p>
        ))}
      </div>
      <button onClick={learn} className="mt-3 w-full rounded-2xl py-2.5 text-sm font-semibold" style={{ background: "var(--surface-2)", color: "var(--accent)" }}>
        Понятно
      </button>
    </div>
  );
}

/** Вторая плашка на гормональной контрацепции — что важно по методу. */
function MethodFact() {
  const { settings } = useFem();
  const s = settings!;
  const now = today();
  if (s.method === "injection" && s.method_start) {
    const next = addDays(s.method_start, 84);
    return <Fact color={PHASE_COLOR.protected} label="Следующий укол" value={short(next)} hint={next < now ? "срок прошёл — запишитесь" : "через 12 недель после прошлого"} />;
  }
  const label: Record<string, [string, string]> = {
    coc: ["Таблетки", "без пропусков — надёжно"],
    pop: ["Мини-пили", "каждый день в одно время"],
    ring: ["Кольцо", "3 недели, затем перерыв"],
    patch: ["Пластырь", "смена раз в неделю"],
    implant: ["Имплант", "действует до 3 лет"],
    iud_hormonal: ["Спираль", "действует 5–8 лет"],
    injection: ["Укол", "раз в 12 недель"],
  };
  const [value, hint] = label[s.method] ?? ["Защита", ""];
  return <Fact color={PHASE_COLOR.protected} label="Метод" value={value} hint={hint} />;
}

function Fact({ color, label, value, hint }: { color: string; label: string; value: string; hint: string }) {
  return (
    <div
      className="fem-card relative overflow-hidden rounded-2xl px-3.5 py-3"
      style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${color} 14%, var(--surface)) 0%, var(--surface) 70%)` }}
    >
      {/* Кружок Dots в углу — в цвет карточки. */}
      <span
        className="pointer-events-none absolute -right-5 -top-5 h-16 w-16 rounded-full"
        style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}
      />
      <span className="relative flex items-center gap-1.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 25%, transparent)` }} />
        {label}
      </span>
      <span className="relative mt-1 block text-[1.0625rem] font-bold tracking-tight">{value}</span>
      <span className="relative block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        {hint}
      </span>
    </div>
  );
}
