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
  // null — ещё не знаем, какие включены: не рисуем ничего, чтобы плитки не
  // появлялись вразнобой (сначала две по умолчанию, потом третья).
  const [enabled, setEnabled] = useState<string[] | null>(null);
  // Когда показать первую плитку: задержка считается от открытия страницы.
  const mountedAt = useRef(0);
  const [start, setStart] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // Средние оценки приложений: null — ещё не пришли (строку не рисуем).
  const [ratings, setRatings] = useState<Map<string, { average: number; total: number }> | null>(null);

  useEffect(() => {
    mountedAt.current = performance.now();
    const show = (apps: string[]) =>
      setEnabled((prev) => {
        if (prev === null) setStart(Math.max(0, delay - (performance.now() - mountedAt.current)));
        return apps;
      });
    try {
      const cached = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (Array.isArray(cached) && cached.length) show(cached);
    } catch {
      // Нет памяти — покажем как в профиле, когда он придёт.
    }
    // Профиль не ответил за полторы секунды — показываем по умолчанию.
    const fallback = setTimeout(() => setEnabled((prev) => prev ?? DEFAULT), 1500);
    const supabase = createClient();
    void supabase.auth.getSession().then(async ({ data }) => {
      const id = data.session?.user.id;
      if (!id) {
        show(DEFAULT);
        return;
      }
      setUserId(id);
      void supabase.rpc("app_ratings").then(({ data, error }) => {
        if (error || !Array.isArray(data)) return;
        const rows = data as { app: string; average: number | string; total: number }[];
        setRatings(new Map(rows.map((r) => [r.app, { average: Number(r.average), total: r.total }])));
      });
      const res = await supabase.from("profiles").select("apps_enabled").eq("id", id).maybeSingle();
      const apps = (res.data as { apps_enabled?: string[] } | null)?.apps_enabled;
      show(apps?.length ? apps : DEFAULT);
      if (apps?.length) remember(apps);
    });
    return () => clearTimeout(fallback);
  }, [delay]);

  const toggle = async (id: string, on: boolean) => {
    const cur = enabled ?? DEFAULT;
    const next = on ? [...cur.filter((x) => x !== id), id] : cur.filter((x) => x !== id);
    if (next.length === 0) return;
    // Порядок — как в списке APPS, а не как включали.
    const ordered = APPS.map((a) => a.id as string).filter((x) => next.includes(x));
    setEnabled(ordered);
    remember(ordered);
    if (userId) await createClient().from("profiles").update({ apps_enabled: ordered }).eq("id", userId);
  };

  const shown = enabled ? APPS.filter((a) => enabled.includes(a.id)) : [];
  // Что было на экране при первом показе — включённые потом шестерёнкой
  // раздвигают место плавно.
  const initial = useRef<Set<string> | null>(null);
  if (!initial.current && enabled) initial.current = new Set(shown.map((a) => a.id));

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

      {/* Место под плитки держим заранее, чтобы низ страницы не прыгал. */}
      <div className="space-y-3" style={{ minHeight: enabled ? undefined : 2 * 84 + 12 }}>
        {shown.map((app, index) => {
          const late = !initial.current?.has(app.id);
          const card = (
            <HomeCard
              href={app.href}
              title={app.what}
              hint={app.hint}
              icon={app.icon}
              color={app.color}
              delay={late ? 0 : start + index * 110}
              rating={ratings ? (ratings.get(app.id) ?? null) : undefined}
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
        {enabled ? <HomeAdminCard delay={start + shown.length * 110} /> : null}
      </div>

      <Sheet open={open} title="Приложения" onClose={() => setOpen(false)}>
        <p className="mb-3 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Какие показывать на главной. Выключенное приложение просто прячется — данные в нём остаются.
        </p>
        <div className="mb-3 overflow-hidden rounded-2xl" style={{ background: "var(--surface-2)" }}>
          {APPS.map((app, i) => {
            const on = (enabled ?? DEFAULT).includes(app.id);
            const last = on && (enabled ?? DEFAULT).length === 1;
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
