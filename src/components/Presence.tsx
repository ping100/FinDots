"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { CURRENT_BUILD } from "@/lib/update";

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

    // Раз за открытие — версия, браузер и «установлено как приложение»:
    // по ним админ отвечает на «у меня не работает» без расспросов.
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      await supabase.rpc("report_client", {
        p_build: CURRENT_BUILD,
        p_ua: navigator.userAgent,
        p_standalone: !!standalone,
      });
    })().catch(() => undefined);

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return null;
}
