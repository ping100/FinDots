"use client";

import { useEffect } from "react";
import { SYSTEM_DARK, paintTheme, rememberedTheme } from "@/lib/look";

/**
 * Тема «Авто» на лету: телефон вечером перешёл на тёмную — и приложение
 * вслед за ним, без перезапуска. Живёт в корне, а не в данных приложений:
 * развилке, админке и входу профиль не нужен, а тема — нужна.
 *
 * Выбор читаем с устройства в момент смены: его туда кладёт профиль, и
 * так ничего не нужно передавать сверху. Пусто — человек ещё не входил,
 * и «как в системе» для него самое разумное.
 */
export function ThemeSync() {
  useEffect(() => {
    const query = matchMedia(SYSTEM_DARK);
    const sync = () => {
      const choice = rememberedTheme();
      if (!choice || choice === "system") paintTheme("system");
    };
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return null;
}
