"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** Как часто отмечаться. Онлайн в админке — отметка не старше двух минут. */
const EVERY = 60_000;

/**
 * «Я здесь» для админки: пока приложение открыто на экране, раз в минуту
 * отмечаемся в базе. Свернули — молчим, и через пару минут человек
 * перестаёт считаться онлайн. Время ставит сервер, не телефон.
 */
export function Presence() {
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setInterval> | undefined;

    const touch = async () => {
      const { data } = await supabase.auth.getSession();
      // Заодно — часовой пояс телефона: по нему база понимает, когда у
      // человека «12:00» и пора напоминать о задаче.
      if (data.session) {
        await supabase.rpc("touch_presence", { p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
      }
    };

    const sync = () => {
      clearInterval(timer);
      if (document.visibilityState !== "visible") return;
      void touch();
      timer = setInterval(() => void touch(), EVERY);
    };

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return null;
}
