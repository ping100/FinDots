"use client";

import { useMemo } from "react";
import { today } from "@/lib/tasks/dates";
import { cycleInfo, signalsFrom, type Phase } from "@/lib/fem/cycle";
import { useFem } from "./DataProvider";

/** Три цвета пятен фона для каждой фазы. */
const TINTS: Record<Phase | "none", [string, string, string]> = {
  period: ["#fb7185", "#f472b6", "#fda4af"],
  follicular: ["#f9a8d4", "#c4b5fd", "#fbcfe8"],
  fertile: ["#5eead4", "#2dd4bf", "#a5b4fc"],
  ovulation: ["#2dd4bf", "#5eead4", "#f9a8d4"],
  luteal: ["#c4b5fd", "#a78bfa", "#f0abfc"],
  late: ["#fcd34d", "#f9a8d4", "#c4b5fd"],
  protected: ["#c4b5fd", "#93c5fd", "#f9a8d4"],
  pregnant: ["#f9a8d4", "#fde68a", "#c4b5fd"],
  none: ["#f472b6", "#c4b5fd", "#5eead4"],
};

/**
 * Живой фон FemDots: мягкие пятна медленно плавают и окрашены в цвет
 * сегодняшней фазы — у неё по её циклу, у партнёра — по её же.
 */
export function Backdrop() {
  const { settings, periods, days, partner } = useFem();
  const now = today();
  const phase = useMemo<Phase | null>(() => {
    if (settings) return cycleInfo(periods, settings, now, signalsFrom(days, settings)).phase;
    if (partner && !partner.paused) {
      return cycleInfo(
        partner.periods,
        { cycle_length: partner.cycle_length, period_length: partner.period_length },
        now,
        { lhDays: partner.lh_days ?? [], mucusDays: partner.mucus_days ?? [], method: partner.hormonal ? "pop" : "none" },
      ).phase;
    }
    return null;
  }, [settings, periods, days, partner, now]);
  const [a, b, c] = TINTS[phase ?? "none"];
  const blob = (color: string) => `radial-gradient(circle, color-mix(in srgb, ${color} var(--blob-alpha), transparent) 0%, transparent 68%)`;
  return (
    <div aria-hidden className="fem-backdrop">
      <span className="fem-blob" style={{ width: "34rem", height: "34rem", top: "-12rem", right: "-14rem", background: blob(a), animation: "blob-a 19s ease-in-out infinite alternate" }} />
      <span className="fem-blob" style={{ width: "30rem", height: "30rem", top: "30%", left: "-16rem", background: blob(b), animation: "blob-b 23s ease-in-out infinite alternate" }} />
      <span className="fem-blob" style={{ width: "28rem", height: "28rem", bottom: "-12rem", right: "-8rem", background: blob(c), animation: "blob-c 27s ease-in-out infinite alternate" }} />
    </div>
  );
}
