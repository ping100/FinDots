"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import { addDays, today } from "@/lib/tasks/dates";
import { FEM_GRADIENT, PHASE_COLOR, PHASE_TEXT, cycleInfo } from "@/lib/fem/cycle";
import { PartnerJoin } from "@/components/fem/PartnerShare";
import { long, range, short } from "@/lib/fem/format";
import { useFem } from "@/components/fem/DataProvider";
import { FemHeader } from "@/components/fem/Shell";
import { CycleRing, DayLog, plural } from "@/components/fem/parts";

/**
 * Главный экран FemDots: кольцо цикла, фаза, одна главная кнопка
 * («начались» / «закончились»), ближайшие даты и самочувствие за сегодня.
 */
export default function FemToday() {
  const { settings, periods, partner, startPeriod, endPeriod } = useFem();
  const now = today();
  const info = useMemo(() => cycleInfo(periods, settings!, now), [periods, settings, now]);
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

      <div className="fem-card rounded-[28px] px-4 pb-5 pt-6">
        <CycleRing info={info} />

        {phase && info.phase ? (
          <div
            className="mt-4 flex items-start gap-2.5 rounded-2xl px-3.5 py-3"
            style={{ background: `color-mix(in srgb, ${PHASE_COLOR[info.phase]} 16%, var(--surface))` }}
          >
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: PHASE_COLOR[info.phase] }} />
            <span>
              <span className="block text-sm font-semibold">{phase.title}</span>
              <span className="block text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
                {phase.hint}
              </span>
            </span>
          </div>
        ) : null}

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
          {info.current ? "Месячные закончились" : "Начались месячные"}
        </button>
        <p className="mt-2 text-center text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          Другой день — отметьте в{" "}
          <Link href="/fem/calendar" replace className="underline">
            календаре
          </Link>
        </p>
      </div>

      {info.nextStart ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Fact
            color={PHASE_COLOR.period}
            label="Следующие месячные"
            value={info.late > 0 ? "задержка" : `~${short(info.nextStart)}`}
            hint={
              info.late > 0
                ? `ожидались ${short(info.nextStart)}`
                : info.daysToNext === 0
                  ? "сегодня"
                  : `через ${info.daysToNext} ${plural(info.daysToNext ?? 0, "день", "дня", "дней")}`
            }
          />
          {fw ? (
            <Fact
              color={PHASE_COLOR.fertile}
              label={fw.now ? "Фертильное окно — сейчас" : "Фертильное окно"}
              value={range(fw.from, fw.to)}
              hint={`овуляция ~${short(fw.ovulation)}`}
            />
          ) : null}
        </div>
      ) : null}

      <div className="fem-card mt-3 rounded-3xl p-4">
        <p className="mb-3 text-[0.9375rem] font-semibold">Как вы сегодня?</p>
        <DayLog day={now} showFlow={!!info.current || (info.daysToNext != null && info.daysToNext <= 2)} />
      </div>

      <p className="mt-4 px-3 text-center text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
        Прогноз — оценка по вашим прошлым циклам ({info.cycleLength} {plural(info.cycleLength, "день", "дня", "дней")}{" "}
        в среднем). Это не способ предохранения и не медицинский совет.
      </p>
    </div>
  );
}

function Fact({ color, label, value, hint }: { color: string; label: string; value: string; hint: string }) {
  return (
    <div className="fem-card rounded-2xl px-3.5 py-3">
      <span className="flex items-center gap-1.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="mt-0.5 block text-base font-semibold">{value}</span>
      <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        {hint}
      </span>
    </div>
  );
}
