import Link from "next/link";
import { Icon } from "@/lib/icons";

/**
 * Дверь в соседнее приложение Dots.
 *
 * Развилка в корне видна только при входе, а переходить человек хочет и
 * посреди работы: записал трату — вспомнил про дело. Вход общий, поэтому
 * переход мгновенный, без повторного логина.
 */
const OTHER = {
  money: {
    href: "/tasks",
    title: "Задачи",
    hint: "Что сделать сегодня и что можно не держать в голове",
    icon: "list",
    color: "#60a5fa",
  },
  tasks: {
    href: "/money",
    title: "Деньги",
    hint: "Сколько есть, сколько ушло и сколько можно потратить",
    icon: "wallet",
    color: "#22c55e",
  },
} as const;

export function AppSwitch({ from }: { from: "money" | "tasks" }) {
  const app = OTHER[from];
  return (
    <Link
      href={app.href}
      className="mb-4 flex items-center gap-3 rounded-2xl px-4 py-3 transition active:scale-[0.99]"
      style={{ background: "var(--surface)" }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: app.color }}
      >
        <Icon name={app.icon} size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem]">{app.title}</span>
        <span
          className="mt-0.5 block text-[0.6875rem] leading-snug"
          style={{ color: "var(--muted)" }}
        >
          {app.hint}
        </span>
      </span>
      <Icon name="chevron-right" size={16} className="opacity-30" />
    </Link>
  );
}
