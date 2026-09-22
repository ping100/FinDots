"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/lib/icons";
import { useStore } from "./DataProvider";

const TABS = [
  { href: "/", label: "Главная", icon: "wallet" },
  { href: "/operations", label: "Операции", icon: "chart" },
  { href: "/debts", label: "Долги", icon: "debt_out" },
  { href: "/analytics", label: "Анализ", icon: "star" },
  { href: "/settings", label: "Ещё", icon: "repair" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, error } = useStore();

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center" style={{ color: "var(--muted)" }}>
        Загружаю…
      </div>
    );
  }

  return (
    <div className="min-h-dvh pt-safe">
      {error ? (
        <p
          className="mx-4 mt-3 rounded-2xl px-4 py-2 text-xs"
          style={{ background: "var(--danger)", color: "#fff" }}
        >
          {error}
        </p>
      ) : null}

      {children}

      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur"
        style={{ background: "color-mix(in srgb, var(--surface) 88%, transparent)", borderColor: "var(--border)" }}
      >
        <div className="mx-auto flex max-w-md justify-around px-2 pt-2">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-1 flex-col items-center gap-0.5 py-1"
                style={{ color: active ? "var(--accent)" : "var(--muted)" }}
              >
                <Icon name={tab.icon} size={22} />
                <span className="text-[10px]">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
