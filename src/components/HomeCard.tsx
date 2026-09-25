import Link from "next/link";
import { Icon } from "@/lib/icons";

/** Карточка на развилке: цветной значок, название, одна строка о главном. */
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
      className="animate-lift flex items-center gap-4 rounded-3xl p-4 transition active:scale-[0.98]"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        animationDelay: `${delay}ms`,
      }}
    >
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
        style={{ background: color }}
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
