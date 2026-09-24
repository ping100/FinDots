import type { CSSProperties, ReactNode } from "react";

/**
 * Подмножество набора Findots (штрих currentColor, сетка 24×24) плюс
 * несколько своих: calendar/clock/tag/bell, которых у финансов не было.
 * Имена не менять — они лежат в базе у каждой категории задач.
 */
const PATHS: Record<string, ReactNode> = {
  circle: <circle cx="12" cy="12" r="7" />,
  plus: <path d="M12 6v12M6 12h12" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  "chevron-down": <path d="M6 9.5l6 6 6-6" />,
  "chevron-right": <path d="M9.5 6l6 6-6 6" />,
  "chevron-left": <path d="M14.5 6l-6 6 6 6" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5l1.4 2.4 2.7-.5.6 2.7 2.5 1.1-1.2 2.5 1.2 2.5-2.5 1.1-.6 2.7-2.7-.5L12 21.5l-1.4-2.4-2.7.5-.6-2.7L4.8 15.8 6 13.3 4.8 10.8l2.5-1.1.6-2.7 2.7.5z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  tag: (
    <>
      <path d="M11.7 3H5.5a2 2 0 0 0-2 2v6.2c0 .5.2 1 .6 1.4l8.4 8.4a2 2 0 0 0 2.8 0l6.2-6.2a2 2 0 0 0 0-2.8l-8.4-8.4a2 2 0 0 0-1.4-.6z" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  bell: (
    <>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
    </>
  ),
  star: <path d="M12 3l2.6 5.5 6 .9-4.3 4.3 1 6.1-5.3-2.9-5.3 2.9 1-6.1L3.4 9.4l6-.9z" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M4 15.5A18 18 0 0 1 2.5 12S6 5.5 12 5.5c1.2 0 2.3.2 3.3.6" />
      <path d="M19.2 8.6A16.6 16.6 0 0 1 21.5 12S18 18.5 12 18.5c-1 0-2-.2-2.8-.5" />
      <path d="M9.9 9.9a3.2 3.2 0 0 0 4.4 4.4" />
      <path d="M3.5 3.5l17 17" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
    </>
  ),
  book: (
    <>
      <path d="M4.5 20V4.5A1.5 1.5 0 0 1 6 3h13.5v15.5H6A1.5 1.5 0 0 0 4.5 20z" />
      <path d="M8.5 7.5h7M8.5 11h4.5" />
    </>
  ),
  home: <path d="M4 10l8-6 8 6v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9zM10 21v-7h4v7" />,
  family: (
    <>
      <circle cx="8" cy="7" r="3" />
      <circle cx="17" cy="8.5" r="2.4" />
      <path d="M2.5 20.5v-3a5.5 5.5 0 0 1 11 0v3M15 20.5v-2.6a4.2 4.2 0 0 1 6.5-3.1" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.5 11h10L20 7H6" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </>
  ),
  health: <path d="M2.5 12h4l2-5 3.5 10.5L14.5 12h7" />,
  dumbbell: <path d="M4 9v6M7 6.5v11M17 6.5v11M20 9v6M7 12h10" />,
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M10 18h4" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="9" width="18" height="12" rx="2" />
      <path d="M3 13h18M12 9v12M12 9S9 3 6.5 5.5 12 9 12 9zM12 9s3-6 5.5-3.5S12 9 12 9z" />
    </>
  ),
  plane: <path d="M2 14l3-1 4 2 5-2-7-8 2-1 9 6 4-1a2 2 0 0 1 0 4l-17 5z" />,
  car: (
    <>
      <path d="M3 16.5v-3.5l2-5.5h14l2 5.5v3.5" />
      <path d="M3 16.5h18M5.5 13h13" />
      <circle cx="7" cy="17.5" r="1.6" />
      <circle cx="17" cy="17.5" r="1.6" />
    </>
  ),
};

export const ICON_GROUPS: { title: string; icons: string[] }[] = [
  { title: "Работа и учёба", icons: ["briefcase", "book", "phone", "star"] },
  { title: "Дом", icons: ["home", "family", "cart", "gift"] },
  { title: "Здоровье и спорт", icons: ["health", "dumbbell"] },
  { title: "Прочее", icons: ["plane", "car", "tag", "bell", "calendar"] },
];

/** Та же палитра, что у Findots — категории обеих частей экосистемы узнаваемы одинаково. */
export const PALETTE = [
  "#22c55e", "#16a34a", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#ef4444", "#f97316", "#f59e0b",
  "#eab308", "#84cc16", "#64748b", "#78716c", "#0f766e",
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
  style?: CSSProperties;
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
