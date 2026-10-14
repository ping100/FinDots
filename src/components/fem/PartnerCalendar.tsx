"use client";

import { useMemo, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { today } from "@/lib/tasks/dates";
import { buildMarks, type CycleInfo } from "@/lib/fem/cycle";
import { CalendarCell, DOT, bandOf } from "./CalendarCell";
import { long } from "@/lib/fem/format";
import { Sheet } from "@/components/ui";
import { useFem } from "./DataProvider";
import { HEART_LABEL, IntimacyHeart, heartOf, heartsOf } from "./parts";

const HEADS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Календарь её цикла глазами партнёра: месячные, прогноз, фертильные дни
 * и сердечки близости — только для просмотра, сердечки приходят из её
 * отметок. Подробности её дневника сюда не попадают.
 */
export function PartnerCalendar({ info }: { info: CycleInfo }) {
  const { partner } = useFem();
  const now = today();
  const [shift, setShift] = useState(0);
  // Куда листали: 1 — вперёд, -1 — назад (для направления анимации).
  const [dir, setDir] = useState(0);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const go = (step: number) => {
    setDir(step);
    setShift((s) => s + step);
  };
  const [picked, setPicked] = useState<string | null>(null);
  const marks = useMemo(() => (partner ? buildMarks(partner.periods, info, now) : new Map()), [partner, info, now]);
  const hearts = useMemo(
    () => new Map((partner?.intimacy ?? []).map((x) => [x.day, { kinds: x.kinds ?? ["sex"], protected: x.protected }])),
    [partner],
  );
  const symptomDays = useMemo(() => new Set((partner?.symptom_days ?? []).map((x) => x.day)), [partner]);
  if (!partner) return null;

  const base = new Date();
  const first = new Date(base.getFullYear(), base.getMonth() + shift, 1);
  const y = first.getFullYear();
  const m = first.getMonth();
  const count = new Date(y, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const pickedValue = picked ? (hearts.get(picked) ?? null) : null;
  // Подпись про сердечки — только когда в этом месяце они есть.
  const monthHasHearts = [...hearts.keys()].some((d) => d.startsWith(iso(y, m, 1).slice(0, 8)));

  return (
    <div className="fem-card mt-3 rounded-3xl p-3">
      <div className="mb-1 flex items-center justify-between px-1">
        <button onClick={() => go(-1)} aria-label="Раньше" className="p-1" style={{ color: "var(--accent)" }}>
          <Icon name="chevron-left" size={20} />
        </button>
        <span className="text-[0.9375rem] font-semibold">
          {MONTHS[m]} {y !== base.getFullYear() ? y : ""}
        </span>
        <button onClick={() => go(1)} aria-label="Позже" className="p-1" style={{ color: "var(--accent)" }}>
          <Icon name="chevron-right" size={20} />
        </button>
      </div>
      {/* Листается пальцем вбок: месяц уезжает в сторону, новый въезжает. */}
      <div
        className="overflow-hidden"
        style={{ touchAction: "pan-y" }}
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const st = swipe.current;
          swipe.current = null;
          if (!st) return;
          const dx = e.clientX - st.x;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - st.y)) go(dx < 0 ? 1 : -1);
        }}
      >
      <div key={shift} className={`grid grid-cols-7 ${dir > 0 ? "animate-month-next" : dir < 0 ? "animate-month-prev" : ""}`}>
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
          const band = bandOf(mark);
          const col = (lead + i) % 7;
          const prev = i > 0 ? bandOf(marks.get(iso(y, m, i))) : null;
          const next = i < count - 1 ? bandOf(marks.get(iso(y, m, i + 2))) : null;
          const heart = heartOf(hearts.get(d));
          return (
            <CalendarCell
              key={d}
              n={i + 1}
              band={band}
              capStart={col === 0 || prev !== band}
              capEnd={col === 6 || next !== band}
              ovulation={!!mark?.ovulation && !mark.period}
              today={d === now}
              heart={heart}
              dots={symptomDays.has(d) ? [DOT.symptoms] : []}
              onClick={heart ? () => setPicked(d) : undefined}
              label={long(d)}
            />
          );
        })}
      </div>
      </div>
      {monthHasHearts ? (
        <p className="mt-1 text-center text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          Сердечки — близость, которую отметила {partner.owner_name}. Нажмите на сердечко — подробнее
        </p>
      ) : null}

      <Sheet open={!!picked} title={picked ? long(picked) : ""} onClose={() => setPicked(null)}>
        {picked ? (
          <div className="space-y-2 pb-3">
            {heartsOf(pickedValue).map((k) => (
              <p key={k} className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm" style={{ background: "var(--surface-2)" }}>
                <IntimacyHeart kind={k} size={18} />
                {HEART_LABEL[k]}
              </p>
            ))}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
