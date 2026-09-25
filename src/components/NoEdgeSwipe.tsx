"use client";

import { useEffect } from "react";

/** Ширина полосы у края, где iOS ловит жест «назад». */
const EDGE = 24;

/**
 * Запрет свайпа от края экрана в приложении с экрана «Домой».
 *
 * iOS принимает такой свайп за «назад» и уводит на предыдущую страницу —
 * человек тянет ряд иконок или просто держит телефон у края и внезапно
 * оказывается на другом экране. Кнопок «назад» у нас хватает, жест не нужен.
 *
 * Отменить его можно только одним способом — отменить само касание у края.
 * Вместе с ним браузер отменяет и нажатие, поэтому короткое касание без
 * сдвига доигрываем сами. В обычном Safari не трогаем: там «назад»
 * свайпом — привычное поведение браузера, и отнимать его незачем.
 */
export function NoEdgeSwipe() {
  useEffect(() => {
    const standalone =
      matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    let start: { x: number; y: number; target: EventTarget | null } | null = null;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || (t.clientX > EDGE && t.clientX < innerWidth - EDGE)) {
        start = null;
        return;
      }
      e.preventDefault();
      start = { x: t.clientX, y: t.clientY, target: e.target };
    };

    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const tap = Math.abs(t.clientX - start.x) < 10 && Math.abs(t.clientY - start.y) < 10;
      if (tap && start.target instanceof HTMLElement) start.target.click();
      start = null;
    };

    document.addEventListener("touchstart", onStart, { passive: false });
    document.addEventListener("touchend", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, []);

  return null;
}
