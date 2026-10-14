/**
 * Маленький «салют» при отметке: из точки нажатия вылетают 3 значка и
 * тают. Чистый DOM — без состояния React, ничего не перерисовывает.
 */
export function burst(x: number, y: number, char: string, count = 3) {
  if (typeof document === "undefined") return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("span");
    el.className = "fx-burst";
    el.textContent = char;
    const spread = count === 1 ? 0 : (i / (count - 1) - 0.5) * 56;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty("--dx", `${spread + (Math.random() - 0.5) * 12}px`);
    el.style.setProperty("--rot", `${(Math.random() - 0.5) * 50}deg`);
    el.style.animationDelay = `${i * 55}ms`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100 + i * 55);
  }
}

/** Координаты центра элемента, по которому нажали (для burst). */
export function centerOf(e: { currentTarget: EventTarget | null; clientX?: number; clientY?: number }) {
  const el = e.currentTarget as HTMLElement | null;
  if (e.clientX && e.clientY) return { x: e.clientX, y: e.clientY };
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 };
}
