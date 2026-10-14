/**
 * Свои значки FemDots вместо смайликов — одинаковые на любом телефоне.
 * Настроение — круглое лицо в пастельном цвете с выражением; симптом —
 * линейный значок в цветном кружке. Рисуются в SVG, масштабируются.
 */

const INK = "#3b2532";

type Face = { bg: string | [string, string]; draw: React.ReactNode };

const eyes = (
  <>
    <circle cx="11.5" cy="13.5" r="1.7" fill={INK} />
    <circle cx="20.5" cy="13.5" r="1.7" fill={INK} />
  </>
);
const cheeks = (
  <>
    <circle cx="8.6" cy="18.6" r="2" fill="#fb7185" opacity=".32" stroke="none" />
    <circle cx="23.4" cy="18.6" r="2" fill="#fb7185" opacity=".32" stroke="none" />
  </>
);

const FACES: Record<string, Face> = {
  calm: {
    bg: "#bbf7d0",
    draw: (
      <>
        <path d="M8.8 13.6q2.7 2.2 5.4 0M17.8 13.6q2.7 2.2 5.4 0" />
        <path d="M12.2 20q3.8 2.6 7.6 0" />
        {cheeks}
      </>
    ),
  },
  happy: {
    bg: "#fde68a",
    draw: (
      <>
        <path d="M8.8 14.4q2.7-3 5.4 0M17.8 14.4q2.7-3 5.4 0" />
        <path d="M10.5 18.6Q16 25.6 21.5 18.6Z" fill={INK} />
        {cheeks}
      </>
    ),
  },
  energetic: {
    bg: "#fed7aa",
    draw: (
      <>
        <circle cx="11.5" cy="13.2" r="2" fill={INK} />
        <circle cx="20.5" cy="13.2" r="2" fill={INK} />
        <path d="M10.5 18.4Q16 25.8 21.5 18.4Z" fill={INK} />
        <path d="M25.5 4.5l-1.6 3.2h2.4l-1.6 3.2" stroke="#ea580c" />
      </>
    ),
  },
  sad: {
    bg: "#bfdbfe",
    draw: (
      <>
        {eyes}
        <path d="M8.8 10.4l4-1.2M23.2 10.4l-4-1.2" />
        <path d="M12 22.2q4-3.6 8 0" />
        <path d="M23.2 16.2q1.4 2.2 0 3.2q-1.4-1 0-3.2Z" fill="#3b82f6" stroke="none" />
      </>
    ),
  },
  irritated: {
    bg: "#fecaca",
    draw: (
      <>
        {eyes}
        <path d="M8.6 9.4l4.6 2.2M23.4 9.4l-4.6 2.2" />
        <path d="M12 21.6q4-2.2 8 0" />
      </>
    ),
  },
  anxious: {
    bg: "#ddd6fe",
    draw: (
      <>
        <circle cx="11.5" cy="13.5" r="2.6" fill="#fff" />
        <circle cx="20.5" cy="13.5" r="2.6" fill="#fff" />
        <circle cx="11.5" cy="13.8" r="1" fill={INK} />
        <circle cx="20.5" cy="13.8" r="1" fill={INK} />
        <path d="M10.5 21.5q1.4-1.6 2.75 0t2.75 0t2.75 0t2.75 0" />
        <path d="M6.6 6.2q1.6 2.4 0 3.6q-1.6-1.2 0-3.6Z" fill="#60a5fa" stroke="none" />
      </>
    ),
  },
  tired: {
    bg: "#c7d2fe",
    draw: (
      <>
        <path d="M9 14.2h5M18 14.2h5" />
        <circle cx="16" cy="21" r="1.7" />
        <path d="M22.6 5.4h3.2l-3.2 3.4h3.2" stroke="#4f46e5" strokeWidth="1.4" />
      </>
    ),
  },
  playful: {
    bg: "#fbcfe8",
    draw: (
      <>
        <circle cx="11.5" cy="13.5" r="1.7" fill={INK} />
        <path d="M17.8 13.8q2.7-2.6 5.4 0" />
        <path d="M11 19q5 4.6 10 0" />
        <path d="M16.6 21.3q0 3.2 2.1 3.2t2.1-3.2" fill="#f472b6" stroke="none" />
      </>
    ),
  },
  swings: {
    bg: ["#fde68a", "#bfdbfe"],
    draw: (
      <>
        <path d="M8.8 14.4q2.7-3 5.4 0" />
        <circle cx="20.5" cy="13.8" r="1.7" fill={INK} />
        <path d="M18.6 10l3.8 1.2" />
        <path d="M10.6 20.6q2.7-3 5.4 0q2.7 3 5.4 0" />
      </>
    ),
  },
  down: {
    bg: "#cbd5e1",
    draw: (
      <>
        <path d="M9 13.2l4.4 1.4M23 13.2l-4.4 1.4" />
        <path d="M11.4 23q4.6-4.4 9.2 0" />
      </>
    ),
  },
  apathy: {
    bg: "#e5e7eb",
    draw: (
      <>
        {eyes}
        <path d="M12 20.8h8" />
      </>
    ),
  },
  confused: {
    bg: "#e9d5ff",
    draw: (
      <>
        <path d="M11.5 13.5m-1 0a1 1 0 1 1 2 0a2 2 0 1 1-4 0a3 3 0 1 1 6 0" />
        <circle cx="20.5" cy="13.5" r="1.7" fill={INK} />
        <path d="M11.6 21.4q2.2-2 4.4 0t4.4-.6" />
      </>
    ),
  },
};

/** Лицо настроения. Неизвестное — нейтральное серое. */
export function MoodIcon({ value, size = 22, muted }: { value: string | null | undefined; size?: number; muted?: boolean }) {
  const f = (value && FACES[value]) || FACES.apathy;
  const id = `mf-${value ?? "none"}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0" style={{ opacity: muted ? 0.45 : 1 }}>
      {Array.isArray(f.bg) ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
              <stop offset="50%" stopColor={f.bg[0]} />
              <stop offset="50%" stopColor={f.bg[1]} />
            </linearGradient>
          </defs>
          <circle cx="16" cy="16" r="15" fill={`url(#${id})`} />
        </>
      ) : (
        <circle cx="16" cy="16" r="15" fill={f.bg} />
      )}
      <g fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {f.draw}
      </g>
    </svg>
  );
}

type Sym = { bg: string; fg: string; d: React.ReactNode };

const SYMS: Record<string, Sym> = {
  ok: { bg: "#dcfce7", fg: "#16a34a", d: <path d="M7.5 12.5l3.2 3.2L16.8 9.5" /> },
  cramps: { bg: "#ffe4e6", fg: "#e11d48", d: <path d="M13.2 5.5L8.6 12.6h3.6l-1.4 5.9 4.8-7.4h-3.6z" /> },
  breasts: {
    bg: "#fce7f3",
    fg: "#db2777",
    d: <path d="M12 18.4s-5.4-3.4-5.4-7.4a2.9 2.9 0 0 1 5.4-1.6a2.9 2.9 0 0 1 5.4 1.6c0 4-5.4 7.4-5.4 7.4z" />,
  },
  headache: {
    bg: "#ffedd5",
    fg: "#ea580c",
    d: (
      <>
        <circle cx="12" cy="12.6" r="6.2" />
        <path d="M7.6 11.4l1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5" />
      </>
    ),
  },
  acne: {
    bg: "#fee2e2",
    fg: "#dc2626",
    d: (
      <>
        <circle cx="12" cy="12" r="6.2" />
        <circle cx="9.6" cy="13" r=".9" fill="currentColor" />
        <circle cx="14.6" cy="11.2" r=".9" fill="currentColor" />
        <circle cx="13" cy="14.8" r=".9" fill="currentColor" />
      </>
    ),
  },
  backache: {
    bg: "#ede9fe",
    fg: "#7c3aed",
    d: (
      <>
        <rect x="9.6" y="4.4" width="4.8" height="3.6" rx="1.4" />
        <rect x="9.6" y="10.2" width="4.8" height="3.6" rx="1.4" />
        <rect x="9.6" y="16" width="4.8" height="3.6" rx="1.4" />
      </>
    ),
  },
  fatigue: {
    bg: "#e0e7ff",
    fg: "#4f46e5",
    d: (
      <>
        <rect x="5" y="8.6" width="12.6" height="6.8" rx="1.8" />
        <path d="M19.4 11v2" />
        <rect x="6.8" y="10.4" width="2.4" height="3.2" rx=".6" fill="currentColor" stroke="none" />
      </>
    ),
  },
  cravings: {
    bg: "#fef3c7",
    fg: "#d97706",
    d: <path d="M8.4 5v5.2a1.8 1.8 0 0 0 3.6 0V5M10.2 11.9V19M15.8 19V5c-1.6 1.2-2.2 3.4-2.2 5.8h2.2" />,
  },
  insomnia: {
    bg: "#e0e7ff",
    fg: "#4338ca",
    d: (
      <>
        <path d="M16.4 14.2a5.6 5.6 0 0 1-6.6-6.6a5.6 5.6 0 1 0 6.6 6.6z" />
        <path d="M17.2 5v3M15.7 6.5h3" />
      </>
    ),
  },
  bellyache: {
    bg: "#ffe4e6",
    fg: "#be123c",
    d: (
      <>
        <circle cx="12" cy="12.4" r="6" />
        <path d="M8.8 12.6q1.6-1.6 3.2 0t3.2 0" />
      </>
    ),
  },
  itch: {
    bg: "#fef9c3",
    fg: "#ca8a04",
    d: <path d="M7.5 6.5q1.8 1.8 0 3.6t0 3.6t0 3.6M12 6.5q1.8 1.8 0 3.6t0 3.6t0 3.6M16.5 6.5q1.8 1.8 0 3.6t0 3.6t0 3.6" />,
  },
  dryness: {
    bg: "#fef3c7",
    fg: "#b45309",
    d: (
      <>
        <path d="M12 5c2.8 3.3 4.6 5.8 4.6 8.2a4.6 4.6 0 0 1-9.2 0C7.4 10.8 9.2 8.3 12 5z" />
        <path d="M6.8 17.8L17.2 7.4" />
      </>
    ),
  },
  nausea: {
    bg: "#dcfce7",
    fg: "#15803d",
    d: <path d="M12 12.2m-1 0a1 1 0 1 1 2 0a3 3 0 1 1-6 0a5 5 0 1 1 10 0" />,
  },
  bloating: {
    bg: "#fce7f3",
    fg: "#be185d",
    d: (
      <>
        <ellipse cx="12" cy="10" rx="4.8" ry="5.6" />
        <path d="M12 15.6q-1.4 2 0 3.8" />
      </>
    ),
  },
  constipation: {
    bg: "#f5f5f4",
    fg: "#78716c",
    d: (
      <>
        <circle cx="12" cy="12" r="6" />
        <path d="M8.6 12h6.8" />
      </>
    ),
  },
  diarrhea: {
    bg: "#ecfccb",
    fg: "#65a30d",
    d: <path d="M6.5 8.4q2.75-1.8 5.5 0t5.5 0M6.5 12q2.75-1.8 5.5 0t5.5 0M6.5 15.6q2.75-1.8 5.5 0t5.5 0" />,
  },
};

/** Значок симптома в цветном кружке. */
export function SymptomIcon({ value, size = 22, muted }: { value: string | null | undefined; size?: number; muted?: boolean }) {
  const s = (value && SYMS[value]) || { bg: "#f1f5f9", fg: "#64748b", d: <circle cx="12" cy="12" r="3" /> };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0" style={{ opacity: muted ? 0.45 : 1, color: s.fg }}>
      <circle cx="12" cy="12" r="12" fill={s.bg} />
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {s.d}
      </g>
    </svg>
  );
}
