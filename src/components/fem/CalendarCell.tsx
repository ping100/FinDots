"use client";

import { PHASE_COLOR, type DayMark } from "@/lib/fem/cycle";
import { IntimacyHeart, type HeartKind } from "./parts";

const TEAL = "#14b8a6";
const TEAL_DARK = "#0d9488";

/** Цвета точек-отметок под числом. */
export const DOT = {
  mood: "#f59e0b",
  symptoms: "#a855f7",
  tests: TEAL,
  note: "#94a3b8",
} as const;

export type BandKind = "period" | "predicted" | "fertile" | null;

/** Какой полосой рисовать день: месячные, их прогноз или фертильное окно. */
export function bandOf(mark: DayMark | undefined): BandKind {
  if (!mark) return null;
  if (mark.period) return "period";
  if (mark.predicted) return "predicted";
  if (mark.fertile || mark.ovulation) return "fertile";
  return null;
}

/**
 * День в календаре FemDots. Соседние дни одной фазы сливаются в полосу
 * (скругления только на краях), овуляция — бирюзовый кружок на полосе,
 * сегодня — розовое кольцо с мягкой волной, под числом — точки отметок.
 */
export function CalendarCell({
  n,
  band,
  capStart,
  capEnd,
  ovulation,
  today,
  heart,
  dots,
  onClick,
  label,
}: {
  n: number;
  band: BandKind;
  capStart: boolean;
  capEnd: boolean;
  ovulation: boolean;
  today: boolean;
  heart: HeartKind | null;
  dots: string[];
  onClick?: () => void;
  label: string;
}) {
  const r = 18;
  const bandStyle: React.CSSProperties =
    band === "period"
      ? { background: `linear-gradient(180deg, color-mix(in srgb, ${PHASE_COLOR.period} 72%, #fff), ${PHASE_COLOR.period})` }
      : band === "predicted"
        ? {
            background: `color-mix(in srgb, ${PHASE_COLOR.period} 12%, transparent)`,
            borderTop: `1.5px dashed ${PHASE_COLOR.period}`,
            borderBottom: `1.5px dashed ${PHASE_COLOR.period}`,
            borderLeft: capStart ? `1.5px dashed ${PHASE_COLOR.period}` : undefined,
            borderRight: capEnd ? `1.5px dashed ${PHASE_COLOR.period}` : undefined,
          }
        : band === "fertile"
          ? { background: `color-mix(in srgb, ${TEAL} 16%, transparent)` }
          : {};
  const color =
    ovulation ? "#fff" : band === "period" ? "#fff" : band === "predicted" ? PHASE_COLOR.period : band === "fertile" ? TEAL_DARK : "var(--text)";

  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="relative flex h-[3.25rem] flex-col items-center justify-center transition active:scale-90"
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      {today ? (
        <span className="absolute -top-1 z-10 rounded-full px-1 text-[0.5rem] font-bold uppercase leading-[0.75rem] tracking-wide" style={{ color: "#ec4899", background: "var(--surface)" }}>
          сегодня
        </span>
      ) : null}
      {band ? (
        <span
          className="pointer-events-none absolute"
          style={{
            top: "50%",
            height: 34,
            marginTop: -19,
            left: capStart ? 3 : 0,
            right: capEnd ? 3 : 0,
            borderTopLeftRadius: capStart ? r : 0,
            borderBottomLeftRadius: capStart ? r : 0,
            borderTopRightRadius: capEnd ? r : 0,
            borderBottomRightRadius: capEnd ? r : 0,
            ...bandStyle,
          }}
        />
      ) : null}
      <span className="relative -mt-1 flex h-9 w-9 items-center justify-center">
        {today ? <span className="ring-pulse absolute inset-0 rounded-full" style={{ background: "#ec4899" }} /> : null}
        <span
          className="relative flex h-[30px] w-[30px] items-center justify-center rounded-full text-[0.9375rem] tabular-nums"
          style={{
            color,
            fontWeight: today || band === "period" || ovulation ? 800 : 500,
            background: ovulation ? `linear-gradient(160deg, #2dd4bf, ${TEAL_DARK})` : today && !band ? "var(--surface)" : undefined,
            boxShadow: today
              ? "0 0 0 2px #ec4899, 0 4px 10px -4px rgba(236,72,153,0.6)"
              : ovulation
                ? "0 4px 10px -4px rgba(13,148,136,0.7)"
                : undefined,
          }}
        >
          {n}
        </span>
        {heart ? (
          <span className="absolute -right-1.5 -top-1 rounded-full p-[1px]" style={{ background: "var(--surface)" }}>
            <IntimacyHeart kind={heart} size={15} />
          </span>
        ) : null}
      </span>
      <span className="absolute bottom-[3px] flex h-1 gap-[3px]">
        {dots.slice(0, 4).map((c) => (
          <span key={c} className="h-1 w-1 rounded-full" style={{ background: c }} />
        ))}
      </span>
    </button>
  );
}
