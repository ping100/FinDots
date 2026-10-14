"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/lib/icons";
import { SKY_WORD, skyPeriod, type SkyPeriod } from "@/lib/sky";

/**
 * Фон главной «Время суток»: утром персиковое небо, днём голубое, вечером
 * сиреневый закат, ночью тёмное со звёздами. По небу медленно плывут три
 * размытых пятна в цветах Dots, ночью мерцают звёзды.
 *
 * Цвета текста и «стекла» для плашек меняются вместе с небом — это свои
 * переменные (--ink, --glass…), а не общие --text и --surface: листы
 * настроек открываются внутри этой же обёртки и должны остаться обычными.
 *
 * Движение замирает, когда приложение свёрнуто, и выключено вовсе при
 * системной настройке «меньше движения».
 */
export function HomeSky({ script, children }: { script: ReactNode; children: ReactNode }) {
  const [period, setPeriod] = useState<SkyPeriod | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const tick = () => setPeriod(skyPeriod());
    tick();
    // Раз в минуту: утро сменится днём прямо на открытом экране.
    const timer = setInterval(tick, 60_000);
    const onVisible = () => {
      setPaused(document.hidden);
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <div className="home-sky" data-sky={period ?? undefined} data-paused={paused ? "" : undefined} suppressHydrationWarning>
      {script}
      <div className="sky-layer" aria-hidden>
        <span className="sky-blob a" />
        <span className="sky-blob b" />
        <span className="sky-blob c" />
        <span className="sky-stars">
          {STARS.map((s, i) => (
            <i
              key={i}
              style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: s.r,
                height: s.r,
                opacity: s.o,
                animationDelay: `${s.d}s`,
                animationDuration: `${s.t}s`,
              }}
            />
          ))}
        </span>
      </div>
      {period ? (
        <span
          className="animate-fade fixed left-4 z-[1] flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.75rem] font-semibold"
          style={{
            top: "calc(env(safe-area-inset-top) + 16px)",
            background: "var(--glass)",
            border: "1px solid var(--glass-line)",
            color: "var(--ink-2)",
          }}
        >
          <span style={{ color: period === "night" || period === "evening" ? "#fcd34d" : "#f59e0b" }}>
            <Icon name={period === "night" || period === "evening" ? "moon" : "sun"} size={15} />
          </span>
          {SKY_WORD[period]}
        </span>
      ) : null}
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

/** Звёзды по зерну, а не Math.random: на сервере и в браузере одни и те же. */
const STARS = (() => {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  return Array.from({ length: 64 }, () => ({
    x: rnd() * 100,
    y: rnd() * 100,
    r: Math.round((rnd() * 1.8 + 0.8) * 10) / 10,
    o: Math.round((rnd() * 0.6 + 0.3) * 100) / 100,
    d: Math.round(rnd() * 60) / 10,
    t: Math.round((rnd() * 3 + 2.5) * 10) / 10,
  }));
})();

