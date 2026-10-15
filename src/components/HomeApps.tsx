"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";
import { HomeAdminCard } from "./HomeAdminCard";
import { Orbit } from "./home/Orbit";
import { HomeSummary } from "./home/HomeSummary";
import { SunPath } from "./home/SunPath";
import { Sheet, Switch } from "./ui";

import { APPS } from "@/lib/apps";

const KEY = "dots.home.apps";
const DEFAULT = ["money", "tasks"];
/** Сводка на главной — на этом телефоне: её видит всякий, кто смотрит на экран. */
const SUMMARY_KEY = "dots.home.summary";

/**
 * Орбита приложений и шестерёнка в углу: в ней включают и выключают
 * приложения на развилке и сводку под орбитой. Какие приложения — в
 * профиле (на другом телефоне будет тот же выбор) и копией в памяти
 * телефона, чтобы орбита не мигала. Сводка — только в памяти телефона.
 *
 * Сводка выключена — орбита крупная, посередине, под ней дуга солнца.
 * Включена — орбита меньше и выше, под ней строки сводки.
 */
export function HomeApps({ delay }: { delay: number }) {
  // null — ещё не знаем, какие включены: не рисуем ничего, чтобы шары не
  // появлялись вразнобой (сначала два по умолчанию, потом третий).
  const [enabled, setEnabled] = useState<string[] | null>(null);
  const [summary, setSummary] = useState<string[]>([]);
  // Когда показать орбиту: задержка считается от открытия страницы.
  const mountedAt = useRef(0);
  const [start, setStart] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // Средние оценки приложений: null — ещё не пришли.
  const [ratings, setRatings] = useState<Map<string, { average: number; total: number }> | null>(null);

  useEffect(() => {
    mountedAt.current = performance.now();
    const show = (apps: string[]) =>
      setEnabled((prev) => {
        if (prev === null) setStart(Math.max(0, delay - (performance.now() - mountedAt.current)));
        return apps;
      });
    try {
      const saved = JSON.parse(localStorage.getItem(SUMMARY_KEY) ?? "null");
      if (Array.isArray(saved)) setSummary(saved);
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

  const toggleSummary = (id: string, on: boolean) => {
    const next = on ? [...summary.filter((x) => x !== id), id] : summary.filter((x) => x !== id);
    setSummary(next);
    try {
      localStorage.setItem(SUMMARY_KEY, JSON.stringify(next));
    } catch {
      // Не запомнится — до перезагрузки всё равно работает.
    }
  };

  const shown = enabled ? APPS.filter((a) => enabled.includes(a.id)) : [];
  const summed = shown.filter((a) => summary.includes(a.id));
  const compact = summed.length > 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Приложения и сводка на главной"
        className="glass animate-fade fixed right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90"
        style={{ top: "calc(env(safe-area-inset-top) + 12px)", color: "var(--ink-2)" }}
      >
        <Icon name="gear" size={19} />
      </button>

      {/* Место под орбиту держим заранее, чтобы низ страницы не прыгал. */}
      <div className={`flex flex-1 flex-col ${compact ? "" : "justify-center"}`} style={{ minHeight: enabled ? undefined : 340 }}>
        {enabled ? (
          <>
            <div className={compact ? "mt-4" : "my-auto pt-4"}>
              <Orbit apps={shown} compact={compact} delay={start} ratings={ratings} />
            </div>
            {compact ? (
              <div className="mt-1">
                <HomeSummary apps={summed} delay={start + 200} />
              </div>
            ) : (
              <div className="mt-2 space-y-3">
                <SunPath delay={start + 450} />
                <button
                  onClick={() => setOpen(true)}
                  className="glass animate-lift mx-auto flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] font-medium transition active:scale-95"
                  style={{ color: "var(--ink-2)", animationDelay: `${start + 550}ms` }}
                >
                  <Icon name="plus" size={15} />
                  Сводка на главной
                </button>
              </div>
            )}
            <div className="mt-4 space-y-3">
              <HomeAdminCard />
            </div>
          </>
        ) : null}
      </div>

      <Sheet open={open} title="Главная" onClose={() => setOpen(false)}>
        <p className="mb-3 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Какие приложения кружат на орбите. Выключенное просто прячется — данные в нём остаются.
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

        <p className="mb-1 mt-5 text-[0.9375rem] font-semibold">Сводка на главной</p>
        <p className="mb-3 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Главное из приложения — прямо под орбитой, без захода внутрь. Её видит любой, кто смотрит на экран,
          поэтому включается отдельно и только на этом телефоне.
        </p>
        <div className="mb-3 overflow-hidden rounded-2xl" style={{ background: "var(--surface-2)" }}>
          {shown.map((app, i) => (
            <div
              key={app.id}
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderTop: i ? "1px solid var(--border)" : undefined }}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: app.color }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem]">{app.name}</span>
                <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
                  {app.summary}
                </span>
              </span>
              <Switch checked={summary.includes(app.id)} onChange={(v) => toggleSummary(app.id, v)} label={`Сводка ${app.name}`} />
            </div>
          ))}
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
