"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";
import { HomeCard } from "./HomeCard";
import { HomeAdminCard } from "./HomeAdminCard";
import { Sheet, Switch } from "./ui";

/** Приложения Dots на развилке. Какие показывать — выбирают шестерёнкой. */
export const APPS = [
  {
    id: "money",
    href: "/money",
    name: "Findots",
    what: "Деньги",
    hint: "Сколько есть, сколько ушло и сколько можно потратить сегодня",
    icon: "wallet",
    color: "#22c55e",
  },
  {
    id: "tasks",
    href: "/tasks",
    name: "Todots",
    what: "Задачи",
    hint: "Что сделать сегодня, что переносится и что горит",
    icon: "list",
    color: "#60a5fa",
  },
  {
    id: "fem",
    href: "/fem",
    name: "FemDots",
    what: "Цикл",
    hint: "Календарь цикла: прогноз месячных, овуляция и самочувствие",
    icon: "flower",
    color: "#ec4899",
  },
] as const;

const KEY = "dots.home.apps";
const DEFAULT = ["money", "tasks"];

/**
 * Карточки приложений и шестерёнка в углу: в ней включают и выключают
 * приложения на развилке. Выбор хранится в профиле — на другом телефоне
 * будет тот же; в памяти телефона — копия, чтобы карточки не мигали.
 */
export function HomeApps({ delay }: { delay: number }) {
  const [enabled, setEnabled] = useState<string[]>(DEFAULT);
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (Array.isArray(cached) && cached.length) setEnabled(cached);
    } catch {
      // Нет памяти — покажем как в профиле, когда он придёт.
    }
    const supabase = createClient();
    void supabase.auth.getSession().then(async ({ data }) => {
      const id = data.session?.user.id;
      if (!id) return;
      setUserId(id);
      const res = await supabase.from("profiles").select("apps_enabled").eq("id", id).maybeSingle();
      const apps = (res.data as { apps_enabled?: string[] } | null)?.apps_enabled;
      if (apps?.length) {
        setEnabled(apps);
        remember(apps);
      }
    });
  }, []);

  const toggle = async (id: string, on: boolean) => {
    const next = on ? [...enabled.filter((x) => x !== id), id] : enabled.filter((x) => x !== id);
    if (next.length === 0) return;
    // Порядок — как в списке APPS, а не как включали.
    const ordered = APPS.map((a) => a.id as string).filter((x) => next.includes(x));
    setEnabled(ordered);
    remember(ordered);
    if (userId) await createClient().from("profiles").update({ apps_enabled: ordered }).eq("id", userId);
  };

  const shown = APPS.filter((a) => enabled.includes(a.id));
  // Что было на экране с самого начала (одинаково на сервере и в браузере).
  const initial = useRef<Set<string> | null>(null);
  if (!initial.current) initial.current = new Set(shown.map((a) => a.id));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Какие приложения показывать"
        className="animate-fade fixed right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90"
        style={{
          top: "calc(env(safe-area-inset-top) + 12px)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        <Icon name="gear" size={19} />
      </button>

      <div className="space-y-3">
        {shown.map((app, index) => {
          // Появилась позже первого показа (из памяти телефона, из профиля
          // или включили шестерёнкой) — раздвигает место плавно.
          const late = !initial.current!.has(app.id);
          const card = (
            <HomeCard
              href={app.href}
              title={app.what}
              hint={app.hint}
              icon={app.icon}
              color={app.color}
              delay={late ? 0 : delay + index * 70}
            />
          );
          return late ? (
            <div key={app.href} className="animate-expand">
              {card}
            </div>
          ) : (
            <Fragment key={app.href}>{card}</Fragment>
          );
        })}
        <HomeAdminCard delay={delay + shown.length * 70} />
      </div>

      <Sheet open={open} title="Приложения" onClose={() => setOpen(false)}>
        <p className="mb-3 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Какие показывать на главной. Выключенное приложение просто прячется — данные в нём остаются.
        </p>
        <div className="mb-3 overflow-hidden rounded-2xl" style={{ background: "var(--surface-2)" }}>
          {APPS.map((app, i) => {
            const on = enabled.includes(app.id);
            const last = on && enabled.length === 1;
            return (
              <div
                key={app.id}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderTop: i ? "1px solid var(--border)" : undefined }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: app.color }}>
                  <Icon name={app.icon} size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem]">
                    {app.name} <span style={{ color: "var(--muted)" }}>· {app.what}</span>
                  </span>
                  <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
                    {last ? "Хотя бы одно приложение должно остаться" : app.hint}
                  </span>
                </span>
                <span style={{ opacity: last ? 0.4 : 1, pointerEvents: last ? "none" : undefined }}>
                  <Switch checked={on} onChange={(v) => void toggle(app.id, v)} label={app.name} />
                </span>
              </div>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

function remember(apps: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(apps));
  } catch {
    // Не страшно — в следующий раз возьмём из профиля.
  }
}
