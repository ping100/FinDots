"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Ошибка iOS в приложении с экрана «Домой»: стоит один раз открыть
 * клавиатуру (например, при входе), экран сжимается на её край и обратно
 * не растёт до перезапуска — внизу остаётся тёмная полоса, всё съезжает.
 * Лечим так: запоминаем самую большую высоту, а после закрытия клавиатуры,
 * если экран остался меньше, на миг прячем и возвращаем страницу — WebKit
 * пересчитывает размер и полоса уходит.
 */
export function ViewportHeal() {
  const pathname = usePathname();

  // Переход на другой экран (например, со входа на развилку) — тоже повод проверить.
  useEffect(() => {
    window.dispatchEvent(new Event("dots:heal"));
  }, [pathname]);

  useEffect(() => {
    const standalone =
      matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    // Наибольшая высота — отдельно для каждой ширины (поворот экрана).
    const peak = new Map<number, number>();
    const note = () => {
      const w = window.innerWidth;
      peak.set(w, Math.max(peak.get(w) ?? 0, window.innerHeight));
    };
    note();

    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };

    let timer: ReturnType<typeof setTimeout> | null = null;
    const heal = () => {
      if (typing()) return;
      const best = peak.get(window.innerWidth) ?? 0;
      if (best - window.innerHeight <= 4) return;
      const body = document.body;
      const y = window.scrollY;
      body.style.display = "none";
      void body.offsetHeight; // принудительный пересчёт
      body.style.display = "";
      window.scrollTo(0, y);
    };
    const later = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(heal, 140);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") later();
    };

    window.addEventListener("resize", note);
    document.addEventListener("focusout", later);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", later);
    window.addEventListener("dots:heal", later);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("resize", note);
      document.removeEventListener("focusout", later);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", later);
      window.removeEventListener("dots:heal", later);
    };
  }, []);

  return null;
}
