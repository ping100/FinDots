"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Loader } from "@/components/Loader";
import { FEM_COLOR } from "@/lib/fem/cycle";
import { useFem } from "./DataProvider";
import { Onboarding } from "./Onboarding";

const TABS = [
  { href: "/fem", label: "Цикл", icon: "drop" },
  { href: "/fem/calendar", label: "Календарь", icon: "calendar" },
  { href: "/fem/stats", label: "Итоги", icon: "chart" },
  { href: "/fem/settings", label: "Настройки", icon: "gear" },
];

/**
 * Оболочка FemDots: своя нижняя панель и свой акцент — розовый вместо
 * синего. Акцент переопределяем переменной на корне: кнопки, переключатели
 * и листы внутри берут его сами.
 */
export function FemShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, error, settings } = useFem();
  if (!ready) return <Loader />;

  const style = { "--accent": FEM_COLOR } as CSSProperties;
  if (!settings) {
    return (
      <div className="min-h-dvh pt-safe" style={style}>
        <Onboarding />
      </div>
    );
  }

  return (
    <div className="min-h-dvh pt-safe" style={style}>
      {error ? (
        <p className="mx-4 mt-3 rounded-2xl px-4 py-2 text-xs" style={{ background: "var(--danger)", color: "#fff" }}>
          {error}
        </p>
      ) : null}
      <div key={pathname} className="animate-page">
        {children}
      </div>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 px-3">
        <div
          className="mx-auto flex max-w-md items-center justify-around rounded-[22px] px-1 py-1.5"
          style={{
            background: "color-mix(in srgb, var(--surface) 92%, transparent)",
            border: "1px solid var(--border)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 4px 18px rgba(0,0,0,0.10)",
          }}
        >
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              replace
              className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5"
              style={{
                color: pathname === tab.href ? "var(--accent)" : "var(--muted)",
                background: pathname === tab.href ? "var(--surface-2)" : undefined,
              }}
            >
              <Icon name={tab.icon} size={21} />
              <span className="text-[0.625rem]">{tab.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Шапка экранов FemDots: заголовок и кружок «домой» к развилке Dots. */
export function FemHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold first-letter:uppercase">{title}</h1>
        {sub ? (
          <p className="text-[0.75rem]" style={{ color: "var(--muted)" }}>
            {sub}
          </p>
        ) : null}
      </div>
      <Link
        href="/"
        aria-label="На главную Dots"
        className="flex h-10 items-center gap-1.5 rounded-full pl-1.5 pr-3.5 text-[0.8125rem] font-medium transition active:scale-95"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: "#64748b" }}>
          <Icon name="home" size={15} />
        </span>
        Dots
      </Link>
    </header>
  );
}
