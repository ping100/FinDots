"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import { today } from "@/lib/tasks/dates";
import { PHASE_COLOR, buildMarks, type CycleInfo } from "@/lib/fem/cycle";
import { long } from "@/lib/fem/format";
import { Sheet } from "@/components/ui";
import { useFem } from "./DataProvider";
import { IntimacyHeart, IntimacyPicker, heartOf } from "./parts";

const HEADS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const TEAL = "#14b8a6";
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Календарь её цикла глазами партнёра: месячные, прогноз, фертильные дни
 * и сердечки близости. Отметить близость может и он — сердечко появится
 * у обоих. Подробности её дневника сюда не попадают.
 */
export function PartnerCalendar({ info }: { info: CycleInfo }) {
  const { partner, setPartnerIntimacy } = useFem();
  const now = today();
  const [shift, setShift] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const marks = useMemo(() => (partner ? buildMarks(partner.periods, info, now) : new Map()), [partner, info, now]);
  const hearts = useMemo(
    () => new Map((partner?.intimacy ?? []).map((x) => [x.day, { kinds: x.kinds ?? ["sex"], protected: x.protected }])),
    [partner],
  );
  if (!partner) return null;

  const base = new Date();
  const first = new Date(base.getFullYear(), base.getMonth() + shift, 1);
  const y = first.getFullYear();
  const m = first.getMonth();
  const count = new Date(y, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const pickedValue = picked ? (hearts.get(picked) ?? null) : null;

  return (
    <div className="fem-card mt-3 rounded-3xl p-3">
      <div className="mb-1 flex items-center justify-between px-1">
        <button onClick={() => setShift((s) => s - 1)} aria-label="Раньше" className="p-1" style={{ color: "var(--accent)" }}>
          <Icon name="chevron-left" size={20} />
        </button>
        <span className="text-[0.9375rem] font-semibold">
          {MONTHS[m]} {y !== base.getFullYear() ? y : ""}
        </span>
        <button onClick={() => setShift((s) => s + 1)} aria-label="Позже" className="p-1" style={{ color: "var(--accent)" }}>
          <Icon name="chevron-right" size={20} />
        </button>
      </div>
      <div className="grid grid-cols-7">
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
          const isToday = d === now;
          const heart = heartOf(hearts.get(d));
          let bg = isToday ? "var(--surface-2)" : "transparent";
          let color = "var(--text)";
          let border = "none";
          if (mark?.period) {
            bg = PHASE_COLOR.period;
            color = "#fff";
          } else if (mark?.predicted) {
            border = `2px dotted ${PHASE_COLOR.period}`;
            color = PHASE_COLOR.period;
          } else if (mark?.ovulation) {
            border = `2px dotted ${TEAL}`;
            color = TEAL;
          } else if (mark?.fertile) {
            color = TEAL;
          }
          return (
            <button
              key={d}
              onClick={() => d <= now && setPicked(d)}
              aria-label={long(d)}
              className="flex h-11 items-center justify-center transition active:scale-90"
            >
              <span
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-[0.875rem] tabular-nums"
                style={{ background: bg, color, border, fontWeight: isToday ? 800 : 500 }}
              >
                {i + 1}
                {heart ? (
                  <span className="absolute -right-2 -top-1.5 rounded-full p-[1px]" style={{ background: "var(--surface)" }}>
                    <IntimacyHeart kind={heart} size={16} />
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-center text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        Нажмите на день, чтобы отметить близость — сердечко появится у обоих
      </p>

      <Sheet open={!!picked} title={picked ? long(picked) : ""} onClose={() => setPicked(null)}>
        {picked ? (
          <div className="pb-3">
            <p className="mb-2.5 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
              Близость в этот день — сердечко появится у вас обоих
            </p>
            <div className="flex flex-wrap gap-2">
              <IntimacyPicker value={pickedValue} onChange={(v) => void setPartnerIntimacy(picked, v)} />
            </div>
            <button
              onClick={() => setPicked(null)}
              className="mt-4 w-full rounded-2xl py-3 text-[0.9375rem] font-semibold"
              style={{ background: "var(--surface-2)" }}
            >
              Готово
            </button>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
