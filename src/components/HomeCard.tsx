import Link from "next/link";
import { Icon } from "@/lib/icons";

/**
 * Карточка на развилке: цветной значок, название, одна строка о главном.
 * Появляется эффектно: вылетает снизу с лёгким наклоном и пружиной, значок
 * «выпрыгивает» с поворотом, по карточке пробегает блик. Задержка — через
 * переменную --d, чтобы значок и блик шли следом за своей карточкой.
 */
export function HomeCard({
  href,
  title,
  hint,
  icon,
  color,
  delay,
  rating,
}: {
  href: string;
  title: string;
  hint: string;
  icon: string;
  color: string;
  delay: number;
  /** Средняя оценка пользователей; null — оценок ещё нет, undefined — не показываем. */
  rating?: { average: number; total: number } | null;
}) {
  return (
    <Link
      href={href}
      className="animate-tile tile-shine relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 transition active:scale-[0.98]"
      style={
        {
          background: "var(--surface)",
          border: "1px solid var(--border)",
          "--d": `${delay}ms`,
          "--glow": color,
        } as React.CSSProperties
      }
    >
      <span
        className="animate-tile-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
        style={{ background: color, boxShadow: `0 8px 18px -8px ${color}` }}
      >
        <Icon name={icon} size={24} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.0625rem] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
        {rating !== undefined ? <Rating rating={rating} /> : null}
      </span>
      <Icon name="chevron-right" size={18} className="shrink-0 opacity-30" />
    </Link>
  );
}

const STAR = "#f59e0b";

/** Пять звёздочек с дробной заливкой и «4,7 · 12 оценок». */
function Rating({ rating }: { rating: { average: number; total: number } | null }) {
  if (!rating) {
    return (
      <span className="animate-fade mt-1.5 block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        Оценок пока нет
      </span>
    );
  }
  const { average, total } = rating;
  const row = (color: string) => (
    <span className="flex w-max gap-[2px]" style={{ color }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width={12} height={12} viewBox="0 0 24 24" fill="currentColor" aria-hidden className="shrink-0">
          <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" />
        </svg>
      ))}
    </span>
  );
  return (
    <span
      className="animate-fade mt-1.5 flex items-center gap-1.5 text-[0.6875rem]"
      aria-label={`Средняя оценка ${average.toLocaleString("ru-RU")} из 5, ${total} ${votes(total)}`}
    >
      <span className="relative">
        {row("var(--border)")}
        <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${(average / 5) * 100}%` }}>
          {row(STAR)}
        </span>
      </span>
      <span className="font-semibold tabular-nums">{average.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
      <span style={{ color: "var(--muted)" }}>
        · {total} {votes(total)}
      </span>
    </span>
  );
}

function votes(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "оценка";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "оценки";
  return "оценок";
}
