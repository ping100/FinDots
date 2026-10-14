"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, today } from "@/lib/tasks/dates";
import { FEM_GRADIENT, PHASE_COLOR, buildMarks, cycleInfo, signalsFrom, daysBetween, type FemPeriod } from "@/lib/fem/cycle";
import { long } from "@/lib/fem/format";
import { useFem } from "@/components/fem/DataProvider";
import { FemHeader } from "@/components/fem/Shell";
import { DayLog, IntimacyHeart, heartOf } from "@/components/fem/parts";
import { CalendarCell, DOT, bandOf } from "@/components/fem/CalendarCell";
import { Sheet } from "@/components/ui";

const HEADS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Сколько месяцев ленты назад и вперёд от текущего. */
const BACK = 12;
const AHEAD = 4;
const TEAL = "#14b8a6";

/**
 * Календарь цикла лентой: месяцы идут подряд, листаются пальцем вниз.
 * Дни одной фазы сливаются в полосу: розовая — месячные, розовый пунктир —
 * их прогноз, бирюзовая — фертильное окно, бирюзовый кружок — овуляция.
 * Цветные точки под числом — что отмечено в этот день.
 */
export default function FemCalendar() {
  const { settings, periods, days, intimacy, startPeriod, endPeriod, deletePeriod } = useFem();
  const now = today();
  const info = useMemo(
    () => cycleInfo(periods, settings!, now, signalsFrom(days, settings)),
    [periods, settings, days, now],
  );
  const marks = useMemo(() => buildMarks(periods, info, now), [periods, info, now]);
  const [picked, setPicked] = useState<string | null>(null);
  const current = useRef<HTMLDivElement | null>(null);
  const [away, setAway] = useState(false);

  const base = new Date();
  const months = Array.from({ length: BACK + AHEAD + 1 }, (_, i) => {
    const first = new Date(base.getFullYear(), base.getMonth() - BACK + i, 1);
    return { y: first.getFullYear(), m: first.getMonth(), shift: i - BACK };
  });

  // Открываемся на текущем месяце; ушли от него — появляется «Сегодня».
  useEffect(() => {
    const el = current.current;
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    window.scrollBy(0, -96);
    const io = new IntersectionObserver(([e]) => setAway(!e.isIntersecting), { rootMargin: "-80px 0px -120px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const periodOf = (day: string): FemPeriod | undefined =>
    periods.find((p) => day >= p.start_date && day <= (p.end_date ?? (p.id === info.current?.id ? now : p.start_date)));
  // Месячные, которые закончились за 1–3 дня до этого дня, — их можно продлить.
  const extendable = (day: string) =>
    periods.find((p) => p.end_date && day > p.end_date && daysBetween(p.end_date, day) <= 3);

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <FemHeader title="Календарь" sub="Отмеченное и прогноз" />

      {/* Дни недели и подсказка цветов — всегда на виду, пока листаешь. */}
      <div
        className="sticky z-10 -mx-4 mb-1 px-4 pb-2 pt-1 backdrop-blur-md"
        style={{ top: "env(safe-area-inset-top)", background: "color-mix(in srgb, var(--bg) 82%, transparent)" }}
      >
        <div className="grid grid-cols-7">
          {HEADS.map((h) => (
            <span key={h} className="text-center text-[0.6875rem] font-medium" style={{ color: "var(--muted)" }}>
              {h}
            </span>
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          <Legend wide style={{ background: PHASE_COLOR.period }} label="Месячные" />
          <Legend wide style={{ border: `1.5px dashed ${PHASE_COLOR.period}`, background: `color-mix(in srgb, ${PHASE_COLOR.period} 12%, transparent)` }} label="Прогноз" />
          <Legend wide style={{ background: `color-mix(in srgb, ${TEAL} 22%, transparent)` }} label="Фертильные" />
          <Legend style={{ background: TEAL }} label="Овуляция" />
          <span className="flex items-center gap-1">
            <IntimacyHeart kind="protected" size={11} />
            <IntimacyHeart kind="unprotected" size={11} />
            Близость
          </span>
        </div>
      </div>

      {months.map(({ y, m, shift }) => {
        const count = new Date(y, m + 1, 0).getDate();
        const lead = (new Date(y, m, 1).getDay() + 6) % 7;
        return (
          <section key={`${y}-${m}`} ref={shift === 0 ? current : undefined} className="fem-card mb-3 rounded-3xl px-2 pb-2 pt-3">
            <h2 className="mb-1 text-center text-[0.9375rem] font-semibold">
              {MONTHS[m]} {y !== base.getFullYear() ? y : ""}
            </h2>
            <div className="grid grid-cols-7">
              {Array.from({ length: lead }, (_, i) => (
                <span key={`l${i}`} />
              ))}
              {Array.from({ length: count }, (_, i) => {
                const d = iso(y, m, i + 1);
                const mark = marks.get(d);
                const band = bandOf(mark);
                const col = (lead + i) % 7;
                const prev = i > 0 ? bandOf(marks.get(iso(y, m, i))) : null;
                const next = i < count - 1 ? bandOf(marks.get(iso(y, m, i + 2))) : null;
                const entry = days.get(d);
                const dots: string[] = [];
                if (entry?.mood) dots.push(DOT.mood);
                if (entry?.symptoms.some((x) => x !== "ok")) dots.push(DOT.symptoms);
                if (entry?.lh || entry?.temp != null || (entry?.preg_test && entry.preg_test !== "none")) dots.push(DOT.tests);
                if (entry?.note) dots.push(DOT.note);
                return (
                  <CalendarCell
                    key={d}
                    n={i + 1}
                    band={band}
                    capStart={col === 0 || prev !== band}
                    capEnd={col === 6 || next !== band}
                    ovulation={!!mark?.ovulation && !mark.period}
                    today={d === now}
                    heart={heartOf(intimacy.get(d), entry?.tags)}
                    dots={dots}
                    onClick={() => setPicked(d)}
                    label={long(d)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="mt-1 px-2 text-center text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        Нажмите на день, чтобы отметить месячные или самочувствие
      </p>
      <p className="mt-1.5 flex flex-wrap justify-center gap-x-3 gap-y-1 px-2 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        Точки под числом:
        {(
          [
            [DOT.mood, "настроение"],
            [DOT.symptoms, "симптомы"],
            [DOT.tests, "тесты и t°"],
            [DOT.note, "заметка"],
          ] as const
        ).map(([c, l]) => (
          <span key={l} className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
            {l}
          </span>
        ))}
      </p>

      {away ? (
        <button
          onClick={() => {
            current.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="animate-lift fixed bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold text-white"
          style={{ background: FEM_GRADIENT, boxShadow: "0 10px 24px -10px rgba(236,72,153,0.7)" }}
        >
          Сегодня
        </button>
      ) : null}

      <Sheet open={!!picked} title={picked ? long(picked) : ""} onClose={() => setPicked(null)}>
        {picked ? (
          <DaySheet
            day={picked}
            future={picked > now}
            period={periodOf(picked)}
            extend={extendable(picked)}
            predicted={!!marks.get(picked)?.predicted}
            fertile={!!marks.get(picked)?.fertile}
            ovulation={!!marks.get(picked)?.ovulation}
            onStart={async () => {
              const end = addDays(picked, info.periodLength - 1);
              await startPeriod(picked, end < now ? end : null);
            }}
            onEnd={(p) => endPeriod(p.id, picked)}
            onDelete={(p) => deletePeriod(p.id)}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function Legend({ style, label, wide }: { style: React.CSSProperties; label: string; wide?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2.5 rounded-full ${wide ? "w-4" : "w-2.5"}`} style={style} />
      {label}
    </span>
  );
}

function DaySheet({
  day,
  future,
  period,
  extend,
  predicted,
  fertile,
  ovulation,
  onStart,
  onEnd,
  onDelete,
}: {
  day: string;
  future: boolean;
  period?: FemPeriod;
  extend?: FemPeriod;
  predicted: boolean;
  fertile: boolean;
  ovulation: boolean;
  onStart: () => Promise<void>;
  onEnd: (p: FemPeriod) => Promise<void>;
  onDelete: (p: FemPeriod) => Promise<void>;
}) {
  const note = ovulation
    ? "Прогноз: овуляция"
    : fertile
      ? "Прогноз: фертильное окно"
      : predicted
        ? "Прогноз: месячные"
        : null;

  return (
    <div className="pb-2">
      {note ? (
        <p className="mb-3 rounded-2xl px-3 py-2 text-sm" style={{ background: "var(--surface-2)" }}>
          {note}
        </p>
      ) : null}

      {future ? (
        <p className="mb-2 text-sm" style={{ color: "var(--muted)" }}>
          Этот день ещё не наступил — отметить его можно будет в свой срок.
        </p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {period ? (
              <>
                {period.start_date !== day && period.end_date !== day ? (
                  <Action onClick={() => onEnd(period)} color={PHASE_COLOR.period}>
                    Закончились в этот день
                  </Action>
                ) : null}
                {!period.end_date && period.start_date === day ? (
                  <Action onClick={() => onEnd(period)} color={PHASE_COLOR.period}>
                    Закончились в этот же день
                  </Action>
                ) : null}
                <Action onClick={() => onDelete(period)} color="var(--danger)" outline>
                  Убрать отметку месячных
                </Action>
              </>
            ) : extend ? (
              <>
                <Action onClick={() => onEnd(extend)} color={PHASE_COLOR.period}>
                  Продлить месячные до этого дня
                </Action>
                <Action onClick={onStart} color={PHASE_COLOR.period} outline>
                  Новые начались в этот день
                </Action>
              </>
            ) : (
              <Action onClick={onStart} color={PHASE_COLOR.period}>
                Месячные начались в этот день
              </Action>
            )}
          </div>
          <DayLog day={day} />
        </>
      )}
    </div>
  );
}

function Action({
  onClick,
  color,
  outline,
  children,
}: {
  onClick: () => Promise<void>;
  color: string;
  outline?: boolean;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await onClick();
        setBusy(false);
      }}
      className="rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-50"
      style={outline ? { border: `1.5px solid ${color}`, color } : { background: color, color: "#fff" }}
    >
      {children}
    </button>
  );
}
