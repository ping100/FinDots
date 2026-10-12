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
}: {
  href: string;
  title: string;
  hint: string;
  icon: string;
  color: string;
  delay: number;
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
      </span>
      <Icon name="chevron-right" size={18} className="shrink-0 opacity-30" />
    </Link>
  );
}
