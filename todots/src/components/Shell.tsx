"use client";

import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/lib/icons";
import { useStore } from "./DataProvider";
import { Loader } from "./Loader";

const TABS = [
  { href: "/", label: "Сегодня", icon: "calendar" },
  { href: "/settings", label: "Настройки", icon: "gear" },
];

const AddContext = createContext<((action: (() => void) | null) => void) | null>(null);

/**
 * Кнопка «+» живёт в нижней панели, а окно новой задачи — на экране дня,
 * потому что ему нужен выбранный в календаре день. Экран отдаёт панели своё
 * действие, панель рисует кнопку. Пока действия нет (например, в
 * настройках), кнопки тоже нет.
 */
export function useAddAction(action: () => void) {
  const register = useContext(AddContext);

  useEffect(() => {
    register?.(action);
    return () => register?.(null);
  }, [register, action]);
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, error } = useStore();
  const [addAction, setAddAction] = useState<(() => void) | null>(null);

  // Через функцию, иначе useState примет само действие за ленивый инициализатор.
  const register = useCallback((action: (() => void) | null) => setAddAction(() => action), []);

  if (!ready) return <Loader />;

  return (
    <AddContext.Provider value={register}>
      <div className="min-h-dvh pt-safe">
        {error ? (
          <p
            className="mx-4 mt-3 rounded-2xl px-4 py-2 text-xs"
            style={{ background: "var(--danger)", color: "#fff" }}
          >
            {error}
          </p>
        ) : null}

        <div key={pathname} className="animate-page">
          {children}
        </div>

        <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 px-3 pb-2">
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
                  // replace, а не push: вкладки — это не «страницы, по которым
                  // ходят вперёд-назад». Иначе на айфоне свайп от левого края
                  // листает их историю, хотя приложение про такое не думает.
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

                {/* Между вкладками, а не поверх них: раньше «+» висела над
                    панелью и на высоких экранах наезжала на неё. */}
                {index === 0 && addAction ? (
                  <button
                    onClick={addAction}
                    aria-label="Новая задача"
                    className="mx-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-transform duration-100 active:scale-90"
                    style={{
                      background: "var(--accent)",
                      boxShadow: "0 4px 12px color-mix(in srgb, var(--accent) 45%, transparent)",
                    }}
                  >
                    <Icon name="plus" size={24} />
                  </button>
                ) : null}
              </Fragment>
            ))}
          </div>
        </nav>
      </div>
    </AddContext.Provider>
  );
}
