"use client";

import { Fragment, createContext, useCallback, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { Loader } from "@/components/Loader";
import { Icon } from "@/lib/icons";
import { today } from "@/lib/tasks/dates";
import { mealNow, type Meal } from "@/lib/food/types";
import { useFood } from "./DataProvider";
import { AddFood } from "./AddFood";

const TABS = [
  { href: "/food", label: "Сегодня", icon: "food" },
  { href: "/food/stats", label: "Итоги", icon: "chart" },
  { href: "/food/settings", label: "Настройки", icon: "gear" },
];

interface FoodUI {
  /** Какой день открыт на «Сегодня»: туда же пишет «+». */
  day: string;
  setDay: (d: string) => void;
  openAdd: (meal?: Meal) => void;
  /** Короткая подпись снизу: «+320 ккал», «Удалено · Вернуть». */
  toast: (text: string, undo?: () => void) => void;
}

const UIContext = createContext<FoodUI | null>(null);

export function useFoodUI(): FoodUI {
  const ui = useContext(UIContext);
  if (!ui) throw new Error("useFoodUI вне FoodShell");
  return ui;
}

/** Оболочка Yumdots: тёплая тема, нижняя панель с «+» посередине, окно добавления. */
export function FoodShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, error, pendingCount } = useFood();
  const [day, setDay] = useState(today);
  const [adding, setAdding] = useState<Meal | null>(null);
  const [note, setNote] = useState<{ text: string; undo?: () => void; key: number } | null>(null);

  const toast = useCallback((text: string, undo?: () => void) => {
    const key = Date.now();
    setNote({ text, undo, key });
    setTimeout(() => setNote((n) => (n?.key === key ? null : n)), 4000);
  }, []);
  const openAdd = useCallback((meal?: Meal) => setAdding(meal ?? mealNow()), []);

  if (!ready) return <Loader />;

  return (
    <UIContext.Provider value={{ day, setDay, openAdd, toast }}>
      <div className="food-theme min-h-dvh overflow-x-clip pt-safe">
        <ConnectionStatus pendingCount={pendingCount} />
        {error ? (
          <p className="mx-4 mt-3 rounded-2xl px-4 py-2 text-xs" style={{ background: "var(--danger)", color: "#fff" }}>
            {error}
          </p>
        ) : null}
        <div key={pathname} className="animate-page">
          {children}
        </div>

        {note ? (
          <div className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4" style={{ bottom: "calc(env(safe-area-inset-bottom) + 92px)" }}>
            <div key={note.key} className="animate-lift pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-2.5 text-[0.875rem] font-medium shadow-lg" style={{ background: "var(--text)", color: "var(--bg)" }}>
              {note.text}
              {note.undo ? (
                <button
                  onClick={() => {
                    note.undo?.();
                    setNote(null);
                  }}
                  className="font-semibold"
                  style={{ color: "#fdba74" }}
                >
                  Вернуть
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

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
            {TABS.map((tab, index) => (
              <Fragment key={tab.href}>
                <Link
                  href={tab.href}
                  replace
                  className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5"
                  style={{ color: pathname === tab.href ? "var(--accent)" : "var(--muted)", background: pathname === tab.href ? "var(--surface-2)" : undefined }}
                >
                  <Icon name={tab.icon} size={21} />
                  <span className="text-[0.625rem]">{tab.label}</span>
                </Link>
                {index === 0 ? (
                  <button
                    onClick={() => openAdd()}
                    aria-label="Добавить еду"
                    className="mx-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-transform duration-100 active:scale-90"
                    style={{ background: "linear-gradient(135deg, #fb923c, #ef4444)", boxShadow: "0 6px 18px -4px rgba(249, 115, 22, 0.6)" }}
                  >
                    <Icon name="plus" size={24} />
                  </button>
                ) : null}
              </Fragment>
            ))}
          </div>
        </nav>

        <AddFood
          open={adding !== null}
          day={pathname === "/food" ? day : today()}
          meal={adding ?? mealNow()}
          onClose={() => setAdding(null)}
          onSaved={(kcal) => toast(`Записано: +${Math.round(kcal)} ккал`)}
        />
      </div>
    </UIContext.Provider>
  );
}

/** Шапка экранов Yumdots: заголовок и кружок «домой» к развилке Dots. */
export function FoodHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
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
