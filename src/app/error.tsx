"use client";

import { useEffect } from "react";
import { logClientError } from "@/lib/errorLog";

/**
 * Экран упал при отрисовке. Вместо английского «This page couldn't load» —
 * понятные слова и кнопка; сама ошибка уходит в журнал админки.
 */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logClientError(error.message || `Ошибка ${error.digest ?? ""}`, error.stack);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <p className="text-[2.5rem] leading-none">😕</p>
      <p className="mt-4 text-[1.125rem] font-semibold">Что-то пошло не так</p>
      <p className="mt-1.5 max-w-xs text-[0.875rem] leading-snug" style={{ color: "var(--muted)" }}>
        Мы уже получили сообщение об ошибке и разберёмся. Попробуйте открыть экран ещё раз — данные на месте.
      </p>
      <div className="mt-6 flex gap-2">
        <button
          onClick={reset}
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          Попробовать снова
        </button>
        <button
          onClick={() => location.reload()}
          className="rounded-full px-5 py-2.5 text-sm font-semibold"
          style={{ background: "var(--surface-2)" }}
        >
          Обновить
        </button>
      </div>
    </div>
  );
}
