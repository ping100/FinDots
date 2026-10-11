import { defaultDropAnimationSideEffects, type DropAnimation } from "@dnd-kit/core";

/**
 * Эффекты перетаскивания: подъём, приземление, возврат на место.
 * Общие для «Денег» (кружки) и «Задач» (карточка на день календаря).
 *
 * Цель приземления ищется по data-drop-id (тот же id, что у useDroppable),
 * анимируется её data-disc — так не нужно протаскивать «куда упало» через
 * пропсы десятка компонентов.
 */

/** Пружина: чуть перелетает и возвращается — живее обычного ease. */
export const SPRING = "cubic-bezier(.34,1.56,.64,1)";

/** Короткий отклик телефона. На iPhone вибрации из браузера нет — тогда молча. */
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Не поддерживается — не страшно.
  }
}

/** Цель подпрыгивает, и от неё расходится волна её же цвета. */
export function landOn(dropId: string) {
  if (typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const target = document.querySelector<HTMLElement>(`[data-drop-id="${CSS.escape(dropId)}"]`);
  const disc = target?.querySelector<HTMLElement>("[data-disc]") ?? target;
  if (!disc?.animate) return;
  const rgb = discColor(disc);
  const ring = (alpha: number, spread: number) => `0 0 0 ${spread}px rgba(${rgb}, ${alpha})`;
  disc.animate(
    [
      { transform: "scale(1.14)", boxShadow: ring(0.55, 0) },
      { transform: "scale(0.9)", boxShadow: ring(0.35, 8), offset: 0.35 },
      { transform: "scale(1.05)", boxShadow: ring(0.12, 16), offset: 0.7 },
      { transform: "scale(1)", boxShadow: ring(0, 22) },
    ],
    { duration: 520, easing: "ease-out" },
  );
}

/** Цвет волны — цвет самой цели, а у прозрачной (день календаря) — акцентный. */
function discColor(el: HTMLElement): string {
  const parts = getComputedStyle(el).backgroundColor.match(/[\d.]+/g) ?? [];
  if (parts.length >= 3 && (parts.length < 4 || Number(parts[3]) > 0)) return parts.slice(0, 3).join(", ");
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  const hex = accent.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  return hex ? hex.slice(1).map((h) => parseInt(h, 16)).join(", ") : "59, 130, 246";
}

/** Отпустили на цели — призрак уменьшается и «впитывается» в неё. */
export const ABSORB: DropAnimation = {
  duration: 200,
  easing: "ease-in",
  keyframes: ({ transform }) => [
    { transform: transformToString(transform.initial, 1), opacity: 1 },
    { transform: transformToString(transform.initial, 0.25), opacity: 0 },
  ],
  sideEffects: null,
};

/** Отпустили мимо — призрак мягко возвращается на своё место. */
export const FLY_BACK: DropAnimation = {
  duration: 320,
  easing: SPRING,
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0.35" } } }),
};

function transformToString(t: { x: number; y: number; scaleX: number; scaleY: number }, scale: number) {
  return `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.scaleX * scale}, ${t.scaleY * scale})`;
}
