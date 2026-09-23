"use client";

import { useEffect, useState } from "react";
import { Logo } from "./Logo";

/**
 * Экран ожидания, пока подтягиваются данные.
 *
 * Показывается не сразу: при быстрой загрузке мелькнувший и тут же
 * пропавший знак раздражает сильнее, чем полсекунды пустоты. Зато если
 * связь плохая — через несколько секунд появляется строчка, объясняющая,
 * что происходит: молчащий экран человек считает зависшим.
 */
export function Loader() {
  const [visible, setVisible] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 250);
    const warn = setTimeout(() => setSlow(true), 5000);
    return () => {
      clearTimeout(show);
      clearTimeout(warn);
    };
  }, []);

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8"
      // Роль и подпись — для тех, кто слушает экран: кружки им ни о чём не
      // говорят, а «Загружаю» произносится.
      role="status"
      aria-label="Загружаю"
    >
      {visible ? (
        <>
          <div className="animate-fade">
            <Logo size={64} breathing />
          </div>
          {slow ? (
            <p
              className="animate-fade max-w-[16rem] text-center text-[0.8125rem] leading-snug"
              style={{ color: "var(--muted)" }}
            >
              Связь медленная — данные ещё идут
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
