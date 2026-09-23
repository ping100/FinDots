import type { CSSProperties, ReactNode } from "react";

/**
 * Иконки рисуются штрихом currentColor в сетке 24×24 — так они одинаково
 * читаются на цветном круге и в тёмной, и в светлой теме.
 *
 * Имена менять нельзя: они хранятся в базе у каждой категории и кошелька.
 * Глиф переработать можно, имя — нет.
 */
const PATHS: Record<string, ReactNode> = {
  // ─────────────────────────── служебные ───────────────────────────
  circle: <circle cx="12" cy="12" r="7" />,
  plus: <path d="M12 6v12M6 12h12" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  "chevron-down": <path d="M6 9.5l6 6 6-6" />,
  "chevron-right": <path d="M9.5 6l6 6-6 6" />,
  "chevron-left": <path d="M14.5 6l-6 6 6 6" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  // Перечёркнутый глаз: сама линия разрыва оставлена «прорезью» в контуре,
  // иначе на мелком размере она сливается с веком
  "eye-off": (
    <>
      <path d="M4 15.5A18 18 0 0 1 2.5 12S6 5.5 12 5.5c1.2 0 2.3.2 3.3.6" />
      <path d="M19.2 8.6A16.6 16.6 0 0 1 21.5 12S18 18.5 12 18.5c-1 0-2-.2-2.8-.5" />
      <path d="M9.9 9.9a3.2 3.2 0 0 0 4.4 4.4" />
      <path d="M3.5 3.5l17 17" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  filter: <path d="M3.5 6h17M6.5 12h11M10 18h4" />,
  grid: (
    <>
      {[6, 12, 18].map((y) =>
        [6, 12, 18].map((x) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" fill="currentColor" stroke="none" />
        )),
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

  // ───────────────────────────── деньги ─────────────────────────────
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
  bank: <path d="M3 10l9-6 9 6M5 10v9M9 10v9M15 10v9M19 10v9M3 21h18" />,
  savings: (
    <>
      <ellipse cx="12" cy="6.5" rx="7" ry="2.5" />
      <path d="M5 6.5v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
      <path d="M5 10.5v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
      <path d="M5 14.5v3c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-3" />
    </>
  ),
  coins: (
    <>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M14.4 8.2a5.5 5.5 0 1 1-6.2 6.2" />
    </>
  ),
  // Ножки и ручка сбоку: без них корпус с кругом внутри читается как купюра
  safe: (
    <>
      <rect x="3" y="3.5" width="18" height="15" rx="2" />
      <circle cx="10" cy="11" r="3.2" />
      <path d="M10 11l2.3-2.3" />
      <path d="M16.5 8v6" />
      <path d="M6.5 18.5v2M17.5 18.5v2" />
    </>
  ),
  crypto: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 8h3.8a2 2 0 0 1 0 4H9.5m0 0h4.2a2 2 0 0 1 0 4H9.5M9.5 8v8M11.5 6.4V8M11.5 16v1.6" />
    </>
  ),
  percent: (
    <>
      <path d="M6.5 17.5L17.5 6.5" />
      <circle cx="8" cy="8" r="2.2" />
      <circle cx="16" cy="16" r="2.2" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7.5 3v5c0 4.7-3.2 8.3-7.5 10-4.3-1.7-7.5-5.3-7.5-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  invest: <path d="M3 17l5.5-5.5 3 3L19 7M14.5 7H19v4.5" />,
  credit: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20M6 15h5M15 14.5l2 2 3.5-4" />
    </>
  ),
  debt_out: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M16 12H8M12 8l-4 4 4 4" />
    </>
  ),
  debt_in: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 12h8M12 8l4 4-4 4" />
    </>
  ),

  // ───────────────────────── работа и доход ─────────────────────────
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
    </>
  ),
  laptop: (
    <>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2 19h20" />
    </>
  ),
  hammer: (
    <>
      <path d="M4.5 6.5h15v5h-15z" />
      <path d="M4.5 6.5C3 7.6 2.3 8.6 2.3 9s.7 1.4 2.2 2.5" />
      <path d="M12.4 11.5h3.2v9.5h-3.2z" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 2.5c2.6 2 4 5 4 8.2 0 2.9-1.4 5.3-4 7.3-2.6-2-4-4.4-4-7.3 0-3.2 1.4-6.2 4-8.2z" />
      <circle cx="12" cy="9.5" r="1.8" />
      <path d="M8.4 14L6 17l2.2.4.4 2.2L11 17M15.6 14L18 17l-2.2.4-.4 2.2L13 17" />
    </>
  ),
  crown: (
    <>
      <path d="M3 8.5l4 3.5 5-7 5 7 4-3.5-1.5 9.5h-15z" />
      <path d="M4.5 21h15" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="9" width="18" height="12" rx="2" />
      <path d="M3 13h18M12 9v12M12 9S9 3 6.5 5.5 12 9 12 9zM12 9s3-6 5.5-3.5S12 9 12 9z" />
    </>
  ),
  star: <path d="M12 3l2.6 5.5 6 .9-4.3 4.3 1 6.1-5.3-2.9-5.3 2.9 1-6.1L3.4 9.4l6-.9z" />,

  // ────────────────────────────── еда ───────────────────────────────
  food: <path d="M6 3v8a3 3 0 0 0 6 0V3M9 11v10M17 3c-1.5 2-2 4-2 6s.7 3 2 3v9" />,
  burger: (
    <>
      <path d="M3.5 10.5c0-3.3 3.8-5.5 8.5-5.5s8.5 2.2 8.5 5.5z" />
      <path d="M3.5 13.5h17" />
      <path d="M4 16.5h16c0 1.9-1.6 3-3.5 3h-9c-1.9 0-3.5-1.1-3.5-3z" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.5 11h10L20 7H6" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </>
  ),
  groceries: (
    <>
      <path d="M3 9h18l-1.8 10.5H4.8z" />
      <path d="M8 9l2-5M16 9l-2-5" />
      <path d="M9.5 12.5v4M14.5 12.5v4" />
    </>
  ),
  coffee: (
    <>
      <path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z" />
      <path d="M17 10h2a2 2 0 0 1 0 5h-2M6 3v2M10 3v2M14 3v2" />
    </>
  ),
  pizza: (
    <>
      <path d="M3.5 7.5a17 17 0 0 1 17 0L12 21z" />
      <path d="M5.2 10.6a13 13 0 0 1 13.6 0" />
      <circle cx="10" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14" cy="14.8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17.8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  restaurant: (
    <>
      <path d="M3 18.5h18" />
      <path d="M5 18.5a7 7 0 0 1 14 0" />
      <path d="M12 11.5V9.8" />
      <circle cx="12" cy="8.6" r="1.2" />
    </>
  ),
  cake: (
    <>
      <path d="M4 20.5h16V14H4z" />
      <path d="M4 14c0-1.7 1.8-3 4-3h8c2.2 0 4 1.3 4 3" />
      <path d="M8 11V8M12 11V7M16 11V8" />
    </>
  ),
  bar: <path d="M4.5 4h15l-7.5 8.5V19M8.5 19h7M6.2 7h11.6" />,

  // ─────────────────────────── транспорт ────────────────────────────
  transport: (
    <>
      <rect x="4" y="4" width="16" height="12" rx="2" />
      <path d="M4 11h16M8 20h8M9 16v4M15 16v4" />
      <circle cx="8" cy="13.5" r="1" />
      <circle cx="16" cy="13.5" r="1" />
    </>
  ),
  car: (
    <>
      <path d="M3 16.5v-3.5l2-5.5h14l2 5.5v3.5" />
      <path d="M3 16.5h18M5.5 13h13" />
      <circle cx="7" cy="17.5" r="1.6" />
      <circle cx="17" cy="17.5" r="1.6" />
    </>
  ),
  taxi: (
    <>
      <path d="M3 16.5v-3.5l2-5.5h14l2 5.5v3.5" />
      <path d="M3 16.5h18M5.5 13h13M9 3.5h6v2H9z" />
      <circle cx="7" cy="17.5" r="1.6" />
      <circle cx="17" cy="17.5" r="1.6" />
    </>
  ),
  train: (
    <>
      <rect x="5" y="4" width="14" height="12" rx="2.5" />
      <path d="M5 11h14M7 20l2.5-4M17 20l-2.5-4M7 20h10" />
      <circle cx="9" cy="13.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  plane: <path d="M2 14l3-1 4 2 5-2-7-8 2-1 9 6 4-1a2 2 0 0 1 0 4l-17 5z" />,
  fuel: (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16M3 21h12M4 11h9" />
      <path d="M16 8l3 3v7a1.5 1.5 0 0 0 3 0V9l-3-3" />
    </>
  ),
  parking: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="3.5" />
      <path d="M10 17.5V7h3.7a2.9 2.9 0 0 1 0 5.8H10" />
    </>
  ),
  bike: (
    <>
      <circle cx="6" cy="16.5" r="3.5" />
      <circle cx="18" cy="16.5" r="3.5" />
      <path d="M6 16.5l4.5-8H15l3 8M10 8.5h4.5M14.5 8.5l-4 8" />
    </>
  ),
  scooter: (
    <>
      <circle cx="5.5" cy="17.5" r="2.5" />
      <circle cx="18.5" cy="17.5" r="2.5" />
      <path d="M8 17.5h8M18.5 17.5L16 5.5h-2.5M16 9h-4.5l-3 8.5" />
    </>
  ),

  // ──────────────────────────── жильё ───────────────────────────────
  home: <path d="M4 10l8-6 8 6v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9zM10 21v-7h4v7" />,
  rent: (
    <>
      <path d="M3 21h18M5 21V8l7-5 7 5v13" />
      <path d="M9 21v-5h6v5" />
    </>
  ),
  repair: <path d="M17.6 3.1l-3.2 3.2 2.3 2.3 3.2-3.2a5.6 5.6 0 0 1-7.2 7.2l-6.4 6.4a2.1 2.1 0 0 1-3-3l6.4-6.4a5.6 5.6 0 0 1 7.9-6.5z" />,
  bulb: (
    <>
      <path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" />
      <path d="M9.5 19h5M10.5 21.5h3" />
    </>
  ),
  bolt: <path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" />,
  water: <path d="M12 3s6.5 6.8 6.5 11a6.5 6.5 0 0 1-13 0C5.5 9.8 12 3 12 3z" />,
  wifi: (
    <>
      <path d="M2.5 9.5a15 15 0 0 1 19 0M6 13a10 10 0 0 1 12 0M9.5 16.5a5 5 0 0 1 5 0" />
      <circle cx="12" cy="20" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  trash: <path d="M4 7h16M10 4h4M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />,
  furniture: (
    <>
      <path d="M3 12.5V10a2 2 0 0 1 4 0v2.5M17 12.5V10a2 2 0 0 1 4 0v2.5" />
      <path d="M3 12.5h18v5H3zM5 17.5v2.5M19 17.5v2.5" />
    </>
  ),

  // ──────────────────────────── здоровье ────────────────────────────
  health: <path d="M2.5 12h4l2-5 3.5 10.5L14.5 12h7" />,
  doctor: <path d="M9.5 3h5v6h6v5h-6v6h-5v-6h-6V9h6z" />,
  pill: (
    <>
      <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)" />
      <path d="M8.5 8.5l7 7" />
    </>
  ),
  tooth: (
    <path d="M6.5 3.5c-2 0-3.5 1.8-3.5 4.2 0 2 .8 3 1.3 5 .5 1.9.4 8.3 2.4 8.3s1.8-6 3.3-6 1.3 6 3.3 6 1.9-6.4 2.4-8.3c.5-2 1.3-3 1.3-5 0-2.4-1.5-4.2-3.5-4.2-1.6 0-2.7 1-3.5 1s-1.9-1-3.5-1z" />
  ),
  glasses: (
    <>
      <circle cx="6" cy="14" r="3.5" />
      <circle cx="18" cy="14" r="3.5" />
      <path d="M9.5 13.8c.5-.8 1.4-1.2 2.5-1.2s2 .4 2.5 1.2M2.5 11l2.2-3.2M21.5 11l-2.2-3.2" />
    </>
  ),
  sport: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4.5 9c4 1 10 1 15 0M4.5 15c4-1 10-1 15 0M12 4c-2 5-2 11 0 16M12 4c2 5 2 11 0 16" />
    </>
  ),
  dumbbell: <path d="M4 9v6M7 6.5v11M17 6.5v11M20 9v6M7 12h10" />,
  smoke: (
    <>
      <path d="M3 16h13v3.5H3zM18 16h1.5v3.5H18zM21 16h1v3.5h-1M12.5 16v3.5" />
      <path d="M15.5 12.5c1.6-1 1.6-2.6 0-3.6M18.5 13.5c2.2-1.6 2.2-4.4 0-6" />
    </>
  ),

  // ───────────────────────── развлечения ────────────────────────────
  fun: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 10h.01M15 10h.01M8.5 14.5a4.5 4.5 0 0 0 7 0" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5" />
    </>
  ),
  music: (
    <>
      <path d="M9 17.5V6l11-2.5v11" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="14.5" r="2.5" />
    </>
  ),
  game: (
    <>
      <path d="M7.5 8h9a5 5 0 0 1 4.9 5.9l-.6 3.3A2.4 2.4 0 0 1 16.6 18l-1.4-2H8.8l-1.4 2a2.4 2.4 0 0 1-4.2-.8l-.6-3.3A5 5 0 0 1 7.5 8z" />
      <path d="M7.8 11.3v2.4M6.6 12.5H9" />
      <circle cx="15.8" cy="11.8" r="1" fill="currentColor" stroke="none" />
      <circle cx="17.8" cy="13.8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" />
      <path d="M12 7v1.5M12 11v2M12 15.5V17" />
    </>
  ),
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  book: (
    <>
      <path d="M4.5 20V4.5A1.5 1.5 0 0 1 6 3h13.5v15.5H6A1.5 1.5 0 0 0 4.5 20z" />
      <path d="M8.5 7.5h7M8.5 11h4.5" />
    </>
  ),
  subscription: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9.5l5 2.5-5 2.5z" />
    </>
  ),

  // ──────────────────────────── покупки ─────────────────────────────
  clothes: <path d="M8 3l4 2 4-2 5 4-3 3-1-1v12H7V9L6 10 3 7z" />,
  shoe: (
    <>
      <path d="M3 16.5v-5.5h3.5l3 2H15c3.2 0 6 1.2 6 3.5v2H3z" />
      <path d="M6.5 11l1-2" />
    </>
  ),
  bag: (
    <>
      <path d="M4.5 9h15l-1 11.5h-13z" />
      <path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2" />
    </>
  ),
  watch: (
    <>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 9.5V12l1.8 1.1M9 7.2L9.5 3h5l.5 4.2M9 16.8l.5 4.2h5l.5-4.2" />
    </>
  ),
  beauty: (
    <>
      <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
      <path d="M18 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
    </>
  ),
  perfume: (
    <>
      <rect x="7" y="9" width="10" height="12" rx="2.5" />
      <path d="M10 9V6h4v3M12 3.5V6M15.5 5.5h2.2v3" />
    </>
  ),
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M10 18h4" />
    </>
  ),

  // ────────────────────────── люди и жизнь ──────────────────────────
  kids: (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M6 21v-3a6 6 0 0 1 12 0v3" />
    </>
  ),
  family: (
    <>
      <circle cx="8" cy="7" r="3" />
      <circle cx="17" cy="8.5" r="2.4" />
      <path d="M2.5 20.5v-3a5.5 5.5 0 0 1 11 0v3M15 20.5v-2.6a4.2 4.2 0 0 1 6.5-3.1" />
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
  education: <path d="M12 4L2 9l10 5 10-5-10-5zM6 11.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5" />,
  heart: <path d="M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9z" />,
  travel: <path d="M2 14l3-1 4 2 5-2-7-8 2-1 9 6 4-1a2 2 0 0 1 0 4l-17 5z" />,
  suitcase: (
    <>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M3 13h18" />
    </>
  ),
  hotel: (
    <>
      <path d="M3 18.5v-6.5h11a4.5 4.5 0 0 1 4.5 4.5v2M3 18.5h18M3 7v5M21 16.5v2" />
      <circle cx="7.5" cy="9.5" r="2" />
    </>
  ),

  // ──────────────────────────── прочее ──────────────────────────────
  cloud: <path d="M7 18.5a4.2 4.2 0 0 1 .5-8.4 5.7 5.7 0 0 1 10.8 1.6 3.5 3.5 0 0 1-.8 6.8z" />,
  tag: (
    <>
      <path d="M3 11V4h7l10.5 10.5-7 7z" />
      <circle cx="7.3" cy="7.3" r="1.3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  question: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.6a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.9.7-.9 1.3v.4" />
      <circle cx="12" cy="16.6" r="1" fill="currentColor" stroke="none" />
    </>
  ),
};

/** Группы для выбора иконки — искать в общей простыне из 80 штук невозможно. */
export const ICON_GROUPS: { title: string; icons: string[] }[] = [
  {
    title: "Деньги",
    icons: ["cash", "card", "bank", "wallet", "savings", "coins", "safe", "crypto",
            "percent", "receipt", "shield", "invest", "credit", "debt_out", "debt_in"],
  },
  {
    title: "Работа и доход",
    icons: ["briefcase", "laptop", "hammer", "rocket", "crown", "gift", "star", "chart"],
  },
  {
    title: "Еда",
    icons: ["food", "burger", "cart", "groceries", "coffee", "pizza", "restaurant", "cake", "bar"],
  },
  {
    title: "Транспорт",
    icons: ["car", "taxi", "transport", "train", "plane", "fuel", "parking", "bike", "scooter"],
  },
  {
    title: "Жильё",
    icons: ["home", "rent", "repair", "bulb", "bolt", "water", "wifi", "trash", "furniture"],
  },
  {
    title: "Здоровье и спорт",
    icons: ["health", "doctor", "pill", "tooth", "glasses", "sport", "dumbbell", "smoke"],
  },
  {
    title: "Развлечения",
    icons: ["fun", "film", "music", "game", "ticket", "dice", "book", "subscription"],
  },
  {
    title: "Покупки",
    icons: ["clothes", "shoe", "bag", "watch", "beauty", "perfume", "phone"],
  },
  {
    title: "Люди и поездки",
    icons: ["kids", "family", "pet", "education", "heart", "travel", "suitcase", "hotel"],
  },
  {
    title: "Прочее",
    icons: ["circle", "cloud", "tag", "calendar", "question"],
  },
];

export const ICON_NAMES = ICON_GROUPS.flatMap((group) => group.icons);

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
