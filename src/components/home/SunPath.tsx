"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { toISODate } from "@/lib/savings";
import { WEATHER_EVENT, WEATHER_KEY, type Weather } from "@/components/HomeWidgets";

/**
 * Дуга солнца под орбитой, когда сводка выключена: восход слева, закат
 * справа, солнышко — там, где оно сейчас. В середине — сколько осталось
 * до заката (или до восхода ночью). Восход и закат приходят вместе с
 * погодой; нет погоды — нет и дуги.
 */
export function SunPath({ delay }: { delay: number }) {
  const [sun, setSun] = useState<Weather["sun"] | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const pull = () => {
      try {
        const w = JSON.parse(localStorage.getItem(WEATHER_KEY) ?? "null") as Weather | null;
        if (w?.sun) setSun(w.sun);
      } catch {
        // Нет памяти — дуги не будет.
      }
    };
    pull();
    window.addEventListener(WEATHER_EVENT, pull);
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.removeEventListener(WEATHER_EVENT, pull);
      clearInterval(timer);
    };
  }, []);

  if (!sun) return null;
  const day = toISODate(new Date(now));
  const i = Math.max(0, sun.rise.findIndex((x) => x.startsWith(day)));
  const rise = new Date(sun.rise[i]).getTime();
  const set = new Date(sun.set[i]).getTime();
  if (!Number.isFinite(rise) || !Number.isFinite(set)) return null;
  // После заката ждём завтрашний восход.
  const nextRise = now > set && sun.rise[i + 1] ? new Date(sun.rise[i + 1]).getTime() : rise;
  const daytime = now >= rise && now <= set;
  const t = daytime ? (now - rise) / (set - rise) : 0;

  // Полуэллипс от (30,78) до (270,78), вершина на 14.
  const angle = Math.PI * (1 - t);
  const x = 150 + 120 * Math.cos(angle);
  const y = 78 - 64 * Math.sin(angle);

  return (
    <div className="glass animate-lift mx-auto w-full rounded-[1.5rem] px-4 pb-3 pt-2" style={{ animationDelay: `${delay}ms` }}>
      <div className="relative">
        <svg viewBox="0 0 300 92" className="block w-full" aria-hidden>
          <defs>
            <linearGradient id="sun-way" x1="0" x2="1">
              <stop offset="0" stopColor="#fb923c" />
              <stop offset="1" stopColor="#fbbf24" />
            </linearGradient>
            <radialGradient id="sun-glow">
              <stop offset="0" stopColor="#fde68a" stopOpacity="0.9" />
              <stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
            </radialGradient>
          </defs>
          <line x1="10" y1="78" x2="290" y2="78" stroke="var(--glass-line)" strokeWidth="1.5" />
          <path d="M30 78 A120 64 0 0 1 270 78" fill="none" stroke="var(--ink-2)" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="3 5" />
          {daytime ? (
            <>
              <path
                d={`M30 78 A120 64 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`}
                fill="none"
                stroke="url(#sun-way)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx={x} cy={y} r="16" fill="url(#sun-glow)" />
              <circle cx={x} cy={y} r="7" fill="#fbbf24" stroke="#fff" strokeWidth="2" />
            </>
          ) : null}
        </svg>
        {/* Над горизонтом, под вершиной дуги. Днём солнышко уже на дуге —
            значок в середине только ночью. */}
        <div className="absolute inset-x-0 bottom-[17%] flex flex-col items-center leading-tight">
          {daytime ? null : (
            <span style={{ color: "#fcd34d" }}>
              <Icon name="moon" size={16} />
            </span>
          )}
          <span className="mt-0.5 text-[1rem] font-bold tabular-nums">{span(daytime ? set - now : nextRise - now)}</span>
          <span className="text-[0.6875rem]" style={{ color: "var(--ink-2)" }}>
            {daytime ? "до заката" : "до восхода"}
          </span>
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[0.75rem] tabular-nums" style={{ color: "var(--ink-2)" }}>
        <span>
          Восход <b style={{ color: "var(--ink)" }}>{clock(sun.rise[now > set && sun.rise[i + 1] ? i + 1 : i])}</b>
        </span>
        <span>
          Закат <b style={{ color: "var(--ink)" }}>{clock(sun.set[i])}</b>
        </span>
      </div>
    </div>
  );
}

const clock = (iso: string) => iso.slice(11, 16);

function span(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${String(m).padStart(2, "0")} мин` : `${h} ч`;
}
