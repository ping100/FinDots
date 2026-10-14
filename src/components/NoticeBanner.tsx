"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Как часто перепроверять: включили работы — люди узнают в течение пары минут. */
const EVERY = 3 * 60_000;

/**
 * «Технические работы» — полоса для всех, пока админ её не выключит.
 * Закрыть можно, но до следующего открытия приложения: новость важная.
 */
export function NoticeBanner() {
  const [message, setMessage] = useState<string | null>(null);
  const [closed, setClosed] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const load = () =>
      void supabase.rpc("app_notice").then(
        ({ data }) => setMessage((data as string | null) ?? null),
        () => undefined,
      );
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, EVERY);
    return () => clearInterval(timer);
  }, []);

  if (!message || closed === message) return null;
  return (
    <div
      className="animate-rise flex items-start gap-3 rounded-2xl px-4 py-3"
      style={{ background: "#fffbeb", border: "1px solid #f59e0b", color: "#78350f", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}
      role="status"
    >
      <span className="text-lg leading-none">🛠</span>
      <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug">
        <b className="block text-[0.875rem]">Технические работы</b>
        {message}
      </span>
      <button onClick={() => setClosed(message)} aria-label="Скрыть" className="shrink-0 rounded-full p-1 opacity-60">
        <span className="text-lg leading-none">×</span>
      </button>
    </div>
  );
}
