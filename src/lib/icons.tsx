import type { ReactNode } from "react";

/**
 * Иконки рисуются штрихом currentColor в сетке 24×24 — так они одинаково
 * читаются на цветном круге и в тёмной, и в светлой теме.
 */
const PATHS: Record<string, ReactNode> = {
  circle: <circle cx="12" cy="12" r="7" />,
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
    </>
  ),
  hammer: <path d="M14 3l7 7-3 3-7-7zM11 8l-8 8 3 3 8-8" />,
  gift: (
    <>
      <rect x="3" y="9" width="18" height="12" rx="2" />
      <path d="M3 13h18M12 9v12M12 9S9 3 6.5 5.5 12 9 12 9zM12 9s3-6 5.5-3.5S12 9 12 9z" />
    </>
  ),
  food: <path d="M6 3v8a3 3 0 0 0 6 0V3M9 11v10M17 3c-1.5 2-2 4-2 6s.7 3 2 3v9" />,
  coffee: (
    <>
      <path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z" />
      <path d="M17 10h2a2 2 0 0 1 0 5h-2M6 3v2M10 3v2M14 3v2" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.5 11h10L20 7H6" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </>
  ),
  transport: (
    <>
      <rect x="4" y="4" width="16" height="12" rx="2" />
      <path d="M4 11h16M8 20h8M9 16v4M15 16v4" />
      <circle cx="8" cy="13.5" r="1" />
      <circle cx="16" cy="13.5" r="1" />
    </>
  ),
  taxi: (
    <>
      <path d="M3 16v-3l2-5h14l2 5v3" />
      <path d="M3 16h18M9 3h6v2H9z" />
      <circle cx="7" cy="17.5" r="1.5" />
      <circle cx="17" cy="17.5" r="1.5" />
    </>
  ),
  fuel: (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16M3 21h12M4 11h9" />
      <path d="M16 8l3 3v7a1.5 1.5 0 0 0 3 0V9l-3-3" />
    </>
  ),
  home: <path d="M4 10l8-6 8 6v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9zM10 21v-7h4v7" />,
  rent: (
    <>
      <path d="M3 21h18M5 21V8l7-5 7 5v13" />
      <path d="M9 21v-5h6v5" />
    </>
  ),
  fun: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 10h.01M15 10h.01M8.5 14.5a4.5 4.5 0 0 0 7 0" />
    </>
  ),
  health: <path d="M12 21s-8-4.8-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 11c0 5.2-8 10-8 10z" />,
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M10 18h4" />
    </>
  ),
  clothes: <path d="M8 3l4 2 4-2 5 4-3 3-1-1v12H7V9L6 10 3 7z" />,
  beauty: (
    <>
      <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
      <path d="M18 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
    </>
  ),
  education: <path d="M12 4L2 9l10 5 10-5-10-5zM6 11.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5" />,
  kids: (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M6 21v-3a6 6 0 0 1 12 0v3" />
    </>
  ),
  pet: (
    <>
      <circle cx="7" cy="9" r="2" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="17" cy="9" r="2" />
      <path d="M12 11c-3 0-5 2.5-5 5a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3c0-2.5-2-5-5-5z" />
    </>
  ),
  sport: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4.5 9c4 1 10 1 15 0M4.5 15c4-1 10-1 15 0M12 4c-2 5-2 11 0 16M12 4c2 5 2 11 0 16" />
    </>
  ),
  travel: <path d="M2 14l3-1 4 2 5-2-7-8 2-1 9 6 4-1a2 2 0 0 1 0 4l-17 5z" />,
  subscription: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9.5l5 2.5-5 2.5z" />
    </>
  ),
  repair: <path d="M14 3a5 5 0 0 0-5 6.5L3 15.5V21h5.5l6-6A5 5 0 1 0 14 3z" />,
  cash: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 10v4M18 10v4" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h12v4" />
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M17 12h2v3h-2a1.5 1.5 0 0 1 0-3z" />
    </>
  ),
  bank: (
    <>
      <path d="M3 10l9-6 9 6M5 10v9M19 10v9M9 10v9M15 10v9M3 21h18" />
    </>
  ),
  savings: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v10M14.5 9.5A2.5 2.5 0 0 0 12 8.5h-.5a2 2 0 0 0 0 4h1a2 2 0 0 1 0 4H12a2.5 2.5 0 0 1-2.5-1" />
    </>
  ),
  debt_out: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h8M12 8l-4 4 4 4" />
    </>
  ),
  debt_in: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M16 12H8M12 8l4 4-4 4" />
    </>
  ),
  credit: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20M6 15h5M16 14l2 2 3-4" />
    </>
  ),
  star: <path d="M12 3l2.6 5.5 6 .9-4.3 4.3 1 6.1-5.3-2.9-5.3 2.9 1-6.1L3.4 9.4l6-.9z" />,
  heart: <path d="M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9z" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  plus: <path d="M12 6v12M6 12h12" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  filter: <path d="M3.5 6h17M6.5 12h11M10 18h4" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  "chevron-down": <path d="M6 9.5l6 6 6-6" />,
  "chevron-right": <path d="M9.5 6l6 6-6 6" />,
  "chevron-left": <path d="M14.5 6l-6 6 6 6" />,
  grid: (
    <>
      {[6, 12, 18].map((y) =>
        [6, 12, 18].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" fill="currentColor" stroke="none" />),
      )}
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  pie: (
    <>
      <path d="M12 3a9 9 0 1 0 9 9h-9z" />
      <path d="M14 2.2A9 9 0 0 1 21.8 10H14z" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5l1.4 2.4 2.7-.5.6 2.7 2.5 1.1-1.2 2.5 1.2 2.5-2.5 1.1-.6 2.7-2.7-.5L12 21.5l-1.4-2.4-2.7.5-.6-2.7L4.8 15.8 6 13.3 4.8 10.8l2.5-1.1.6-2.7 2.7.5z" />
    </>
  ),
};

export const ICON_NAMES = Object.keys(PATHS).filter((n) => n !== "plus");

export const PALETTE = [
  "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#84cc16", "#64748b", "#0ea5e9",
];

export function Icon({
  name,
  size = 24,
  className,
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {PATHS[name] ?? PATHS.circle}
    </svg>
  );
}
