"use client";

import { useCallback, useEffect, useState } from "react";
import { CURRENT_BUILD, applyUpdate, updateAvailable } from "@/lib/update";
import { createClient } from "@/lib/supabase/client";
import { clearOffline, lastUser } from "@/lib/offline";

/** Разделы, которые должны открываться без сети. */
const OFFLINE_PAGES = [
  "/",
  "/money",
  "/money/analytics",
  "/money/operations",
  "/money/debts",
  "/money/settings",
  "/tasks",
  "/tasks/settings",
  "/fem",
  "/fem/calendar",
  "/fem/together",
  "/fem/stats",
  "/fem/settings",
];

/**
 * Без сети приложение открывается из сохранённых страниц. Сохраняем их,
 * только когда кто-то вошёл (гостю лендинга они ни к чему), и стираем всё
 * сохранённое, если человек вышел: при связи сессии нет, а следы остались.
 */
async function prepareOffline(reg: ServiceWorkerRegistration) {
  if (!navigator.onLine) return;
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) {
    if (lastUser()) await clearOffline();
    return;
  }
  if (!lastUser()) return;
  // Чуть позже: сначала пусть загрузится то, что человек открыл.
  setTimeout(() => reg.active?.postMessage({ type: "warm", paths: OFFLINE_PAGES }), 6000);
}

/**
 * Регистрация service worker и присмотр за обновлениями.
 *
 * Добавленное на экран приложение может неделями не перезагружать вкладку,
 * и человек будет смотреть на старую версию. Поэтому сверяемся с сервером
 * при запуске, при каждом возвращении к приложению и раз в полчаса — и
 * предлагаем обновиться полосой внизу, не перезагружая экран у человека
 * под руками.
 */
export function RegisterSW() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (await updateAvailable()) setReady(true);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    if ("serviceWorker" in navigator) {
      // Версия в адресе — у каждой выкладки свой worker и свой кэш.
      navigator.serviceWorker
        .register(`/sw.js?v=${CURRENT_BUILD}`)
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => prepareOffline(reg))
        .catch((error) => {
        // Без service worker приложение работает как обычный сайт, но без
        // уведомлений — след в консоли остаётся, чтобы это можно было
        // отличить от «просто не нажал» при разборе жалобы.
        console.error("Service worker registration failed", error);
        });
    }

    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(check, 30 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [check]);

  if (!ready) return null;

  // Позиция внизу экрана — общая для всех таких полос, задаёт её
  // BottomBanners: одновременно с этой может показаться ещё и полоса про
  // ответ администратора, и класть их друг на друга нельзя.
  return (
    <div
      className="animate-rise flex items-center gap-3 rounded-2xl px-4 py-3"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--accent)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      }}
    >
      <span className="flex-1 text-sm leading-snug">
        Вышла новая версия
        <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          Записи не потеряются — они хранятся на сервере
        </span>
      </span>
      <button
        onClick={() => {
          setBusy(true);
          void applyUpdate();
        }}
        disabled={busy}
        className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold text-white transition-transform duration-100 active:scale-95 disabled:opacity-50"
        style={{ background: "var(--accent)" }}
      >
        {busy ? "Обновляю…" : "Обновить"}
      </button>
      <button
        onClick={() => setReady(false)}
        aria-label="Позже"
        className="shrink-0 rounded-full p-1 opacity-50"
      >
        <span className="text-lg leading-none">×</span>
      </button>
    </div>
  );
}
