import type { DropAnimation } from "@dnd-kit/core";

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

/**
 * Через сколько после броска открывать окно (сумма расхода и т.п.).
 * Раньше оно открывалось сразу и закрывало собой приземление — его просто
 * не было видно. Этого хватает, чтобы призрак впитался, а цель отыграла
 * основной прыжок; волна дорасходится уже под затемнением.
 */
export const AFTER_LANDING_MS = 480;

/** Отпустили на цели: прыжок начинается, когда призрак почти впитался. */
const LAND_DELAY_MS = 120;

/** Цель подпрыгивает, и от неё расходится волна её же цвета. */
export function landOn(dropId: string) {
  if (typeof document === "undefined") return;
  window.setTimeout(() => bounce(dropId), LAND_DELAY_MS);
}

function bounce(dropId: string) {
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
  // Кружок Findots закрашен градиентом — его цвет лежит в --c.
  const own = el.style.getPropertyValue("--c").trim().match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
  if (own) return own.slice(1, 4).map((h) => parseInt(h, 16)).join(", ");
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

/**
 * Отпустили мимо — призрак плавно возвращается и встаёт ровно на место
 * оригинала: выпрямляется, ужимается до его размера, а в конце они
 * меняются местами через короткое перетекание. Без этого призрак
 * прилетал приподнятым и наклонённым и исчезал рывком.
 */
const BACK_MS = 420;
/** Доля времени на полёт; остаток — перетекание призрака в оригинал. */
const BACK_FLY = 0.78;
const BACK_EASE = "cubic-bezier(.22,1,.36,1)";

export const FLY_BACK: DropAnimation = {
  duration: BACK_MS,
  easing: "linear",
  keyframes: ({ transform }) => [
    { transform: transformToString(transform.initial, 1), opacity: 1, easing: BACK_EASE },
    { transform: transformToString(transform.final, 1), opacity: 1, offset: BACK_FLY },
    { transform: transformToString(transform.final, 1), opacity: 0 },
  ],
  sideEffects: ({ active, dragOverlay }) => {
    const ghost = dragOverlay.node.querySelector<HTMLElement>("[data-ghost]");
    // Кружок «Денег» подменяется точно по своему кружку, карточка задачи —
    // целиком: у неё призрак другой формы.
    const disc = active.node.querySelector<HTMLElement>("[data-disc]");
    const target = disc ?? active.node;
    const hidden = disc ? 0 : 0.35;
    const fly = { duration: BACK_MS * BACK_FLY, easing: BACK_EASE, fill: "forwards" as const };
    const anims: Animation[] = [];

    anims.push(
      target.animate(
        [{ opacity: hidden }, { opacity: hidden, offset: BACK_FLY }, { opacity: 1 }],
        { duration: BACK_MS, fill: "forwards" },
      ),
    );

    if (ghost) {
      const from = getComputedStyle(ghost);
      let to = "none";
      if (disc) {
        // Куда кружок призрака прилетел бы сам (весь слой едет к рамке
        // оригинала) и куда ему надо — в центр настоящего кружка.
        const g = ghost.getBoundingClientRect();
        const o = dragOverlay.node.getBoundingClientRect();
        const a = active.node.getBoundingClientRect();
        const d = disc.getBoundingClientRect();
        const dx = d.left + d.width / 2 - (g.left + g.width / 2 + a.left - o.left);
        const dy = d.top + d.height / 2 - (g.top + g.height / 2 + a.top - o.top);
        // Размер — по вёрстке, а не по рамке: оригинал в этот миг ещё
        // чуть сжат от нажатия и сразу распрямится.
        to = `translate(${dx}px, ${dy}px) scale(${disc.offsetWidth / ghost.offsetWidth})`;
      }
      anims.push(
        ghost.animate(
          [
            { transform: from.transform, boxShadow: from.boxShadow },
            {
              transform: to,
              boxShadow: disc
                ? "0 1px 2px rgba(0,0,0,0.12), 0 0 0 rgba(0,0,0,0), 0 0 0 0 rgba(0,0,0,0)"
                : "0 0 0 rgba(0,0,0,0)",
            },
          ],
          fly,
        ),
      );
    }

    // Сумма под призраком в оригинале не нужна — гаснет в начале полёта.
    dragOverlay.node.querySelectorAll<HTMLElement>("[data-ghost-extra]").forEach((el) => {
      anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" }));
    });

    return () => anims.forEach((a) => a.cancel());
  },
};

function transformToString(t: { x: number; y: number; scaleX: number; scaleY: number }, scale: number) {
  return `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.scaleX * scale}, ${t.scaleY * scale})`;
}
