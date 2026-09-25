"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Сколько приложение должно пробыть свёрнутым, чтобы возврат считался входом. */
const AWAY = 10 * 60_000;

/**
 * Возвращение в приложение начинается с развилки «Деньги / Задачи».
 *
 * iOS не перезапускает приложение с экрана «Домой», а размораживает его
 * там, где оставили, — и развилку человек видел только при первом запуске.
 * Короткую отлучку (глянуть сообщение и вернуться) входом не считаем:
 * выкидывать человека с экрана, где он только что был, — хуже, чем не
 * показать развилку.
 */
export function ReturnHome() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const standalone =
      matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    let hiddenAt: number | null = null;
    const onChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      const busy = pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/auth");
      if (away >= AWAY && !busy) router.replace("/");
    };

    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [pathname, router]);

  return null;
}
