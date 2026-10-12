"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import { addDays, today } from "@/lib/tasks/dates";
import { PHASE_COLOR, buildMarks, cycleInfo, daysBetween, type FemPeriod } from "@/lib/fem/cycle";
import { long } from "@/lib/fem/format";
import { useFem } from "@/components/fem/DataProvider";
import { FemHeader } from "@/components/fem/Shell";
import { DayLog } from "@/components/fem/parts";
import { Sheet } from "@/components/ui";

const HEADS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Календарь цикла: каждый день — кружок. Залитые розовые — отмеченные
 * месячные, пунктир — прогноз, бирюзовые — фертильное окно, с обводкой —
 * овуляция. Точка под числом — в этот день отмечено самочувствие.
 */
export default function FemCalendar() {
  const { settings, periods, days, startPeriod, endPeriod, deletePeriod } = useFem();
  const now = today();
  const info = useMemo(() => cycleInfo(periods, settings!, now), [periods, settings, now]);
  const marks = useMemo(() => buildMarks(periods, info, now), [periods, info, now]);
  const [shift, setShift] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  const base = new Date();
  const first = new Date(base.getFullYear(), base.getMonth() + shift, 1);
  const y = first.getFullYear();
  const m = first.getMonth();
  const count = new Date(y, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;

  const periodOf = (day: string): FemPeriod | undefined =>
    periods.find((p) => day >= p.start_date && day <= (p.end_date ?? (p.id === info.current?.id ? now : p.start_date)));
  // Месячные, которые закончились за 1–3 дня до этого дня, — их можно продлить.
  const extendable = (day: string) =>
    periods.find((p) => p.end_date && day > p.end_date && daysBetween(p.end_date, day) <= 3);

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <FemHeader title="Календарь" sub="Отмеченное и прогноз" />

      <div className="fem-card rounded-3xl p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <button onClick={() => setShift((s) => s - 1)} aria-label="Раньше" className="p-1" style={{ color: "var(--accent)" }}>
            <Icon name="chevron-left" size={22} />
          </button>
          <span className="text-[0.9375rem] font-semibold">
            {MONTHS[m]} {y !== base.getFullYear() ? y : ""}
          </span>
          <button onClick={() => setShift((s) => s + 1)} aria-label="Позже" className="p-1" style={{ color: "var(--accent)" }}>
            <Icon name="chevron-right" size={22} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {HEADS.map((h) => (
            <span key={h} className="pb-1 text-center text-[0.625rem]" style={{ color: "var(--muted)" }}>
              {h}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`l${i}`} />
          ))}
          {Array.from({ length: count }, (_, i) => {
            const d = iso(y, m, i + 1);
            const mark = marks.get(d);
            const logged = days.has(d);
            const isToday = d === now;
            let bg = "transparent";
            let color = "var(--text)";
            let border = "none";
            if (mark?.period) {
              bg = PHASE_COLOR.period;
              color = "#fff";
            } else if (mark?.predicted) {
              border = `1.5px dashed ${PHASE_COLOR.period}`;
              color = PHASE_COLOR.period;
            } else if (mark?.ovulation) {
              bg = PHASE_COLOR.ovulation;
              color = "#fff";
            } else if (mark?.fertile) {
              bg = `color-mix(in srgb, ${PHASE_COLOR.fertile} 28%, transparent)`;
            }
            return (
              <button
                key={d}
                onClick={() => setPicked(d)}
                aria-label={long(d)}
                className="flex h-11 flex-col items-center justify-center transition active:scale-90"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[0.8125rem] tabular-nums"
                  style={{
                    background: bg,
                    color,
                    border,
                    fontWeight: isToday ? 800 : 500,
                    boxShadow: isToday ? "0 0 0 2px var(--surface), 0 0 0 3.5px var(--text)" : undefined,
                  }}
                >
                  {i + 1}
                </span>
                <span className="mt-0.5 h-1 w-1 rounded-full" style={{ background: logged ? "var(--accent)" : "transparent" }} />
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          <Legend style={{ background: PHASE_COLOR.period }} label="Месячные" />
          <Legend style={{ border: `1.5px dashed ${PHASE_COLOR.period}` }} label="Прогноз" />
          <Legend style={{ background: `color-mix(in srgb, ${PHASE_COLOR.fertile} 40%, transparent)` }} label="Фертильные" />
          <Legend style={{ background: PHASE_COLOR.ovulation }} label="Овуляция" />
        </div>
      </div>

      <p className="mt-3 px-2 text-center text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        Нажмите на день, чтобы отметить месячные или самочувствие
      </p>

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

function Legend({ style, label }: { style: React.CSSProperties; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-full" style={style} />
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
