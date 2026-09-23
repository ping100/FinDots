"use client";

import { useEffect, useState } from "react";

/**
 * Какие способы входа включены в Supabase.
 *
 * Спрашиваем сервер, а не зашиваем в код: пока провайдер не настроен в
 * панели, кнопка «Войти через Google» только привела бы человека к ошибке.
 * Как только тумблер включат — кнопка появится сама, без нового деплоя.
 * И наоборот: выключили — пропала.
 */
export function useProvider(name: "google"): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
          headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { external?: Record<string, boolean> };
        if (alive) setOn(Boolean(data.external?.[name]));
      } catch {
        // Не ответил — считаем, что способа нет. Почта работает всегда.
      }
    })();
    return () => {
      alive = false;
    };
  }, [name]);

  return on;
}
