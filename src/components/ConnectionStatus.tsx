"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useStore } from "./DataProvider";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Состояние связи — маленькой строкой вверху, и только когда есть что
 * сказать: нет сети, траты ждут отправки или связь только что вернулась.
 * Когда всё в порядке, места не занимает.
 */
export function ConnectionStatus() {
  const { pendingCount } = useStore();
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  // «Связь восстановлена» — пару секунд после того, как сеть вернулась
  // и очередь ушла. Иначе непонятно, отправилось ли записанное без сети.
  const [restored, setRestored] = useState(false);
  const wasDown = useRef(false);
  useEffect(() => {
    if (!online || pendingCount > 0) {
      wasDown.current = true;
      return;
    }
    if (!wasDown.current) return;
    wasDown.current = false;
    setRestored(true);
    const timer = setTimeout(() => setRestored(false), 2500);
    return () => clearTimeout(timer);
  }, [online, pendingCount]);

  const waiting = pendingCount > 0 ? ` · ждёт отправки: ${pendingCount}` : "";
  const state = !online
    ? { dot: "var(--muted)", text: `Нет сети${waiting || " — траты сохранятся на телефоне"}` }
    : pendingCount > 0
      ? { dot: "#f59e0b", text: `Сервер не отвечает${waiting}` }
      : restored
        ? { dot: "#22c55e", text: "Связь восстановлена" }
        : null;
  if (!state) return null;

  return (
    <div className="animate-fade flex justify-center px-4 pt-2" data-connection role="status" aria-live="polite">
      <span
        className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.6875rem]"
        style={{ background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--border)" }}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: state.dot }} />
        {state.text}
      </span>
    </div>
  );
}
