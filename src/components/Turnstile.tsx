"use client";

import { useEffect, useRef } from "react";

/**
 * Капча Cloudflare Turnstile на регистрации и входе.
 *
 * Регистрация в приложении одношаговая — почта подтверждается не письмом, —
 * поэтому эндпоинт Supabase открыт любому, у кого есть публичный anon-ключ,
 * а он по своей природе лежит в коде страницы. Капча закрывает эту дверь.
 *
 * Пока NEXT_PUBLIC_TURNSTILE_SITE_KEY не задан, компонент ничего не рисует и
 * токен не требуется — приложение работает как раньше. Включается парой:
 * site key сюда, secret key в Supabase → Authentication → Attack Protection.
 */

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      theme?: "auto" | "light" | "dark";
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function Turnstile({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string | null) => void;
  /** Увеличь после неудачной отправки: токен Turnstile одноразовый. */
  resetKey?: number;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // Колбэк держим в ref, чтобы виджет не пересоздавался на каждый рендер формы.
  const callback = useRef(onToken);
  callback.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;

    const mount = () => {
      if (cancelled || widgetId.current !== null || !holder.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(holder.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token) => callback.current(token),
        "expired-callback": () => callback.current(null),
        "error-callback": () => callback.current(null),
      });
    };

    if (window.turnstile) {
      mount();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", mount);

    return () => {
      cancelled = true;
      script.removeEventListener("load", mount);
    };
  }, []);

  useEffect(() => {
    if (resetKey && widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
    }
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={holder} className="mb-3 flex justify-center" />;
}
