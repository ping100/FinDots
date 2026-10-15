"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Loader } from "@/components/Loader";
import { useFem } from "./DataProvider";
import { Onboarding } from "./Onboarding";
import { PartnerScreen } from "./PartnerScreen";
import { Backdrop } from "./Backdrop";
import { herNew } from "./Together";

const TABS = [
  { href: "/fem", label: "Цикл", icon: "drop" },
  { href: "/fem/calendar", label: "Календарь", icon: "calendar" },
  { href: "/fem/together", label: "Вместе", icon: "heart" },
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
  const { ready, error, settings, partner, signals, userId } = useFem();
  if (!ready) return <Loader />;
  // Новое от партнёра без ответа — красный кружок на «Вместе».
  const fresh = herNew(signals, userId).length;

  // Ссылка-приглашение открывается всегда — даже до первого входа в FemDots.
  if (pathname.startsWith("/fem/join")) {
    return <div className="fem-theme min-h-dvh overflow-x-clip pt-safe">{children}</div>;
  }
  // Своего цикла нет: партнёр видит цикл своей девушки, остальные — знакомство.
  if (!settings) {
    return (
      <div className="fem-theme min-h-dvh overflow-x-clip pt-safe">
        {partner ? <Backdrop /> : null}
        {partner ? <PartnerScreen /> : <Onboarding />}
      </div>
    );
  }

  return (
    <div className="fem-theme min-h-dvh overflow-x-clip pt-safe">
      <Backdrop />
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
              <span className="relative">
                <Icon name={tab.icon} size={21} />
                {tab.href === "/fem/together" && fresh ? (
                  <span
                    className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-bold tabular-nums text-white"
                    style={{ background: "var(--danger)" }}
                    aria-label={`Новых: ${fresh}`}
                  >
                    {fresh}
                  </span>
                ) : null}
              </span>
              <span className="text-[0.625rem]">{tab.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Шапка экранов FemDots: заголовок и кружок «домой» к развилке Dots. */
export function FemHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
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
      <div className="flex shrink-0 items-center gap-2">
      {action}
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
      </div>
    </header>
  );
}
