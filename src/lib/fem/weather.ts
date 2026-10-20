"use client";

/**
 * Погода для цветка (эксперимент): своя — с /api/weather, её — через
 * fem_partner_weather(). Держим 30 минут в localStorage, чтобы не спрашивать
 * на каждое открытие. Партнёру она отдаёт только код погоды, температуру и
 * ветер: ни города, ни координат.
 */
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Weather {
  /** Код погоды WMO (0 — ясно, 61 — дождь, 71 — снег…). */
  code: number;
  temp: number;
  /** Ветер, км/ч. */
  wind: number;
  day: boolean;
}

export type Sky = "clear" | "clouds" | "fog" | "rain" | "storm" | "snow";

export function skyOf(code: number): Sky {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (code >= 2) return "clouds";
  return "clear";
}

/** Сильный ветер — от 30 км/ч: цветок качается сильнее, летят листья. */
export const windy = (w: Weather) => w.wind >= 30;
/** Жара — от +30°. */
export const hot = (w: Weather) => w.temp >= 30;

const SKY_TEXT: Record<Sky, [string, string]> = {
  clear: ["☀️", "ясно"],
  clouds: ["☁️", "облачно"],
  fog: ["🌫", "туман"],
  rain: ["🌧", "дождь"],
  storm: ["⛈", "гроза"],
  snow: ["❄️", "снег"],
};

/** «🌧 +8°, дождь» — подпись под цветком. */
export function weatherLine(w: Weather): string {
  const sky = skyOf(w.code);
  const [icon, text] = sky === "clear" && !w.day ? ["🌙", "ясно"] : SKY_TEXT[sky];
  const t = `${w.temp > 0 ? "+" : w.temp < 0 ? "−" : ""}${Math.abs(w.temp)}°`;
  return `${icon} ${t}, ${windy(w) ? `${text}, ветер` : text}`;
}

const FRESH = 30 * 60_000;
const KEY = "dots:weather:";

function cached(src: string): Weather | null | undefined {
  try {
    const raw = localStorage.getItem(KEY + src);
    if (!raw) return undefined;
    const { at, w } = JSON.parse(raw) as { at: number; w: Weather | null };
    return Date.now() - at < FRESH ? w : undefined;
  } catch {
    return undefined;
  }
}

function remember(src: string, w: Weather | null) {
  try {
    localStorage.setItem(KEY + src, JSON.stringify({ at: Date.now(), w }));
  } catch {
    // Нет хранилища — спросим в следующий раз снова.
  }
}

async function mine(): Promise<Weather | null> {
  const have = cached("mine");
  if (have !== undefined) return have;
  const res = await fetch("/api/weather").catch(() => null);
  const w = res?.ok ? ((await res.json().catch(() => null)) as Weather | null) : null;
  // Не узнали — не спрашиваем снова 30 минут, только если сеть есть.
  if (w || navigator.onLine) remember("mine", w);
  return w;
}

async function hers(): Promise<Weather | null> {
  const have = cached("hers");
  if (have !== undefined) return have;
  const { data, error } = await createClient().rpc("fem_partner_weather");
  if (error) return null;
  const w = (data as Weather | null) ?? null;
  remember("hers", w);
  return w;
}

/** Её погода для партнёра — раз в 30 минут, пока приложение открыто. */
export async function publishWeather(): Promise<void> {
  const fresh = cached("sent");
  if (fresh !== undefined) return;
  const w = await mine();
  if (!w) return;
  const { error } = await createClient().rpc("fem_weather_set", { p: w });
  if (!error) remember("sent", w);
}

/**
 * Погода для цветка. src "hers" — её погода (у партнёра); если она давно не
 * открывала приложение, показываем его собственную. whose — чья вышла.
 */
export function useWeather(on: boolean, src: "mine" | "hers"): { weather: Weather; whose: "mine" | "hers" } | null {
  const [state, setState] = useState<{ weather: Weather; whose: "mine" | "hers" } | null>(null);
  useEffect(() => {
    if (!on) {
      setState(null);
      return;
    }
    let alive = true;
    const load = async () => {
      const theirs = src === "hers" ? await hers() : null;
      const w = theirs ?? (await mine());
      if (alive) setState(w ? { weather: w, whose: theirs ? "hers" : "mine" } : null);
    };
    void load();
    const t = setInterval(() => void load(), FRESH);
    const vis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [on, src]);
  return state;
}
