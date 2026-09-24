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
  bell: (
    <>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
    </>
  ),
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
};

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
