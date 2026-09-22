"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/lib/icons";
import { useStore } from "./DataProvider";

const TABS = [
  { href: "/", label: "Панель", icon: "grid" },
  { href: "/operations", label: "История", icon: "list" },
  { href: "/analytics", label: "Отчет", icon: "pie" },
  { href: "/debts", label: "Долги", icon: "debt_out" },
  { href: "/settings", label: "Настройки", icon: "gear" },
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

      {/* key по маршруту — иначе анимация не повторится при смене вкладки */}
      <div key={pathname} className="animate-page">
        {children}
      </div>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 px-3 pb-2">
        <div
          className="mx-auto flex max-w-md justify-around rounded-[22px] px-1 py-1.5"
          style={{
            background: "color-mix(in srgb, var(--surface) 92%, transparent)",
            border: "1px solid var(--border)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 4px 18px rgba(0,0,0,0.10)",
          }}
        >
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5"
                style={{
                  color: active ? "var(--accent)" : "var(--muted)",
                  background: active ? "var(--surface-2)" : undefined,
                }}
              >
                <Icon name={tab.icon} size={21} />
                <span className="text-[0.625rem]">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
