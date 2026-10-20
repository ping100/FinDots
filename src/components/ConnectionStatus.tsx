"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

type State = "ok" | "sending" | "offline";

const LOOK: Record<State, { color: string; anim: string }> = {
  // Всё хорошо — зелёная, тихо «дышит» волной.
  ok: { color: "#22c55e", anim: "conn-ok" },
  // Связь есть, очередь уходит — янтарная, пульсирует чаще.
  sending: { color: "#f59e0b", anim: "conn-busy" },
  // Нет сети — серая, медленно мигает.
  offline: { color: "#94a3b8", anim: "conn-off" },
};

/**
 * Связь — маленькой точкой вверху по центру, над шапкой: на iPhone в полосе
 * под вырезом (центр точки на 4px выше края безопасной зоны), без выреза —
 * у самого края экрана. Так она не наезжает на месяц в шапке.
 *
 * Зелёная — всё подключено,
 * янтарная — отправляются изменения, серая — нет сети. Нажатие раскрывает
 * её в подпись. Сама раскрывается, когда что-то случилось: пропала сеть,
 * изменения ждут отправки, связь вернулась.
 */
export function ConnectionStatus({ pendingCount }: { pendingCount: number }) {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const state: State = !online ? "offline" : pendingCount > 0 ? "sending" : "ok";

  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = (ms: number) => {
    clearTimeout(timer.current);
    setOpen(true);
    timer.current = setTimeout(() => setOpen(false), ms);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  // Что-то поменялось — раскрываемся сами: «нет сети», «связь восстановлена».
  const prev = useRef<State>(state);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (prev.current === state) return;
    const wasDown = prev.current !== "ok";
    prev.current = state;
    setRestored(state === "ok" && wasDown);
    show(state === "ok" ? 2500 : 3500);
  }, [state]);

  const waiting = pendingCount > 0 ? ` · ждёт отправки: ${pendingCount}` : "";
  const text =
    state === "offline"
      ? `Нет сети${waiting || " · изменения сохранятся на телефоне"}`
      : state === "sending"
        ? `Отправляю изменения: ${pendingCount}`
        : restored
          ? "Связь восстановлена · всё отправлено"
          : "Всё подключено · данные сохранены";
  const look = LOOK[state];

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[45] flex justify-center"
      // Кнопка 18px: центр точки = top + 9 = max(5px, safe − 4px).
      style={{ top: "max(-4px, calc(env(safe-area-inset-top) - 13px))" }}
      data-connection
      role="status"
      aria-live="polite"
    >
      <button
        onClick={() => (open ? setOpen(false) : show(2500))}
        aria-label={text}
        className="pointer-events-auto flex h-[18px] items-center justify-center px-3 transition-transform duration-300 ease-out"
        // Подпись выше точки не помещается: раскрываясь, чуть опускается.
        style={{ transform: open ? "translateY(10px)" : "none" }}
      >
        <span
          className="flex items-center overflow-hidden rounded-full transition-all duration-300 ease-out"
          style={{
            height: open ? 22 : 8,
            maxWidth: open ? 320 : 8,
            padding: open ? "0 10px 0 7px" : 0,
            gap: open ? 6 : 0,
            background: open ? "var(--surface)" : "transparent",
            border: open ? "1px solid var(--border)" : "none",
            boxShadow: open ? "0 6px 18px -8px rgba(0,0,0,.3)" : "none",
          }}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            {/* Волна вокруг точки — у каждого состояния своя. */}
            <span className={`absolute inset-0 rounded-full ${look.anim}`} style={{ background: look.color }} />
            <span className="relative h-2 w-2 rounded-full" style={{ background: look.color, boxShadow: `0 0 6px ${look.color}` }} />
          </span>
          <span
            className="whitespace-nowrap text-[0.6875rem] font-medium transition-opacity duration-200"
            style={{ color: "var(--muted)", opacity: open ? 1 : 0 }}
          >
            {text}
          </span>
        </span>
      </button>
    </div>
  );
}
