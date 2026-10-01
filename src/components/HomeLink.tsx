import Link from "next/link";
import { Icon } from "@/lib/icons";

/** Назад на развилку Dots — один переход, без выхода из аккаунта. */
export function HomeLink() {
  return (
    <Link
      href="/"
      className="mb-4 flex items-center gap-3 rounded-2xl px-4 py-3 transition active:scale-[0.99]"
      style={{ background: "var(--surface)" }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: "#64748b" }}
      >
        <Icon name="home" size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem]">На главную Dots</span>
        <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
          Выбор между Findots и Todots
        </span>
      </span>
      <Icon name="chevron-right" size={16} className="opacity-30" />
    </Link>
  );
}
