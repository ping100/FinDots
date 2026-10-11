"use client";

import { useEffect, useState } from "react";
import { buzz } from "@/lib/dragFx";
import { formatMoney } from "@/lib/money";
import type { Wallet } from "@/lib/types";
import { Button } from "./ui";

/** Цвета знака Dots: доход, кошелёк, расход. */
const DOTS = ["#22c55e", "#60a5fa", "#f97316"];

/**
 * Цель копилки достигнута: из её кружка разлетаются кружки в цветах Dots и
 * самой копилки, снизу — карточка с поздравлением. Один раз на цель.
 */
export function Celebration({ wallet, onDone }: { wallet: Wallet; onDone: () => void }) {
  // Пауза — чтобы праздник не совпал с приземлением кружка и окном суммы.
  const [on, setOn] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setOn(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!on) return;
    buzz([20, 60, 20, 60, 40]);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    // Взрыв — из кружка копилки, а если он сейчас не на экране — сверху по центру.
    const disc = document.querySelector<HTMLElement>(`[data-drop-id="drop-wallet:${wallet.id}"] [data-disc]`);
    const r = disc?.getBoundingClientRect();
    const visible = r && r.top > 0 && r.bottom < window.innerHeight;
    const ox = visible ? r.left + r.width / 2 : window.innerWidth / 2;
    const oy = visible ? r.top + r.height / 2 : window.innerHeight * 0.3;

    const layer = document.createElement("div");
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden";
    document.body.appendChild(layer);
    const colors = [...DOTS, wallet.color];
    for (let i = 0; i < 44; i++) {
      const dot = document.createElement("span");
      const size = 6 + Math.random() * 8;
      dot.style.cssText = `position:absolute;left:${ox - size / 2}px;top:${oy - size / 2}px;width:${size}px;height:${size}px;border-radius:50%;background:${colors[i % colors.length]}`;
      layer.appendChild(dot);
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 170;
      const dx = Math.cos(angle) * speed;
      const up = Math.sin(angle) * speed - 120; // сначала вверх…
      const fall = up + 260 + Math.random() * 160; // …потом вниз, как конфетти
      dot.animate(
        [
          { transform: "translate(0, 0) scale(0.3)", opacity: 1 },
          { transform: `translate(${dx * 0.7}px, ${up}px) scale(1)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${dx}px, ${fall}px) scale(0.8)`, opacity: 0 },
        ],
        { duration: 1300 + Math.random() * 700, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards", delay: Math.random() * 120 },
      );
    }
    const cleanup = window.setTimeout(() => layer.remove(), 2400);
    return () => {
      window.clearTimeout(cleanup);
      layer.remove();
    };
  }, [on, wallet.id, wallet.color]);

  if (!on) return null;
  return (
    <div className="fixed inset-x-0 bottom-28 z-50 flex justify-center px-4">
      <div
        className="animate-rise w-full max-w-sm rounded-3xl p-4 text-center shadow-2xl"
        style={{ background: "var(--surface)", border: `2px solid ${wallet.color}` }}
      >
        <p className="text-[1.0625rem] font-semibold">Цель достигнута!</p>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          «{wallet.name}»: собрано {formatMoney(Number(wallet.goal), wallet.currency)}. Так держать!
        </p>
        <div className="mt-3">
          <Button onClick={onDone}>Ура!</Button>
        </div>
      </div>
    </div>
  );
}

/** Отмечали ли уже эту цель (та же копилка и та же сумма цели). */
export function celebrated(wallet: Wallet): boolean {
  try {
    return localStorage.getItem(`dots.goal.${wallet.id}.${wallet.goal}`) === "1";
  } catch {
    return true; // без хранилища не празднуем, чтобы не повторять каждый раз
  }
}

export function markCelebrated(wallet: Wallet) {
  try {
    localStorage.setItem(`dots.goal.${wallet.id}.${wallet.goal}`, "1");
  } catch {
    // Нет хранилища — ничего страшного.
  }
}
