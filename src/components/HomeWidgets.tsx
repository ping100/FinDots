"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_SHOWN, crossRate, formatRate, labelFor, perFor, useOfficialRates } from "@/lib/officialRates";

/**
 * Две плашки на развилке: погода и курс валют. Маленькие и тихие — это
 * подсказка «что снаружи», а не отдельное приложение.
 *
 * Погода — open-meteo.com (без ключа). Где человек — по геолокации, если
 * он уже разрешил её; иначе город по часовому поясу телефона, а нажатие на
 * плашку один раз спрашивает разрешение. Курс — наш /api/rates (Нацбанк РК).
 * Оба ответа держим в памяти телефона: при следующем открытии плашки
 * появляются сразу, а свежие данные подтягиваются следом.
 */

type Weather = { temp: number; code: number; day: boolean; city: string; at: number };
type Shown = { codes: string[]; base: string };

const WEATHER_KEY = "dots.home.weather";
const SHOWN_KEY = "dots.home.shown";
const FRESH_MS = 30 * 60_000;

/** Город по часовому поясу — когда геолокации нет. */
const ZONES: Record<string, { city: string; lat: number; lon: number }> = {
  "Asia/Almaty": { city: "Алматы", lat: 43.24, lon: 76.89 },
  "Asia/Qostanay": { city: "Костанай", lat: 53.21, lon: 63.63 },
  "Asia/Aqtobe": { city: "Актобе", lat: 50.28, lon: 57.17 },
  "Asia/Aqtau": { city: "Актау", lat: 43.65, lon: 51.17 },
  "Asia/Atyrau": { city: "Атырау", lat: 47.1, lon: 51.92 },
  "Asia/Oral": { city: "Уральск", lat: 51.23, lon: 51.37 },
  "Asia/Qyzylorda": { city: "Кызылорда", lat: 44.85, lon: 65.51 },
  "Asia/Tashkent": { city: "Ташкент", lat: 41.31, lon: 69.28 },
  "Asia/Bishkek": { city: "Бишкек", lat: 42.87, lon: 74.59 },
  "Europe/Moscow": { city: "Москва", lat: 55.76, lon: 37.62 },
};
const FALLBACK = ZONES["Asia/Almaty"];

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Нет хранилища — просто не запомним.
  }
}

/** Код погоды WMO → значок и слово. */
function describe(code: number, day: boolean): { icon: string; text: string } {
  if (code === 0) return { icon: day ? "sun" : "moon", text: "ясно" };
  if (code <= 2) return { icon: day ? "cloud-sun" : "cloud", text: "переменная облачность" };
  if (code === 3) return { icon: "cloud", text: "пасмурно" };
  if (code === 45 || code === 48) return { icon: "fog", text: "туман" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: "snow", text: "снег" };
  if (code >= 95) return { icon: "storm", text: "гроза" };
  if (code >= 51) return { icon: "rain", text: "дождь" };
  return { icon: "cloud", text: "облачно" };
}

async function loadWeather(lat: number, lon: number, city: string): Promise<Weather> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`,
  );
  const json = (await res.json()) as { current?: { temperature_2m: number; weather_code: number; is_day: number } };
  if (!json.current) throw new Error("нет погоды");
  return {
    temp: Math.round(json.current.temperature_2m),
    code: json.current.weather_code,
    day: json.current.is_day === 1,
    city,
    at: Date.now(),
  };
}

/** Название места по координатам — чтобы плашка говорила, где эта погода. */
async function cityAt(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ru`,
    );
    const json = (await res.json()) as { city?: string; locality?: string; principalSubdivision?: string };
    return json.city || json.locality || json.principalSubdivision || "Рядом";
  } catch {
    return "Рядом";
  }
}

function position(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      reject,
      { timeout: 8000, maximumAge: 30 * 60_000 },
    ),
  );
}

export function HomeWidgets({ delay = 0 }: { delay?: number }) {
  const [weather, setWeather] = useState<Weather | null>(null);
  const official = useOfficialRates();
  // Какие валюты и к какой основной — из профиля (выбирают в настройках
  // денег). Запоминаем, чтобы при следующем открытии не ждать базу.
  const [shown, setShown] = useState<Shown>({ codes: DEFAULT_SHOWN, base: "KZT" });
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const cachedW = read<Weather>(WEATHER_KEY);
    const cachedS = read<Shown>(SHOWN_KEY);
    if (cachedW) setWeather(cachedW);
    if (cachedS) setShown(cachedS);

    if (!cachedW || Date.now() - cachedW.at > FRESH_MS) void refreshWeather(false);
    const supabase = createClient();
    void supabase.auth.getSession().then(async ({ data }) => {
      const id = data.session?.user.id;
      if (!id) return;
      const res = await supabase.from("profiles").select("shown_rates, base_currency").eq("id", id).maybeSingle();
      const row = res.data as { shown_rates?: string[]; base_currency?: string } | null;
      if (!row) return;
      const next = { codes: row.shown_rates ?? DEFAULT_SHOWN, base: row.base_currency ?? "KZT" };
      setShown(next);
      write(SHOWN_KEY, next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ask — нажали на плашку: можно спросить разрешение на геолокацию. */
  const refreshWeather = async (ask: boolean) => {
    try {
      let place: { lat: number; lon: number; city?: string } | null = null;
      const state = await navigator.permissions?.query({ name: "geolocation" }).then((s) => s.state).catch(() => null);
      if (navigator.geolocation && (state === "granted" || ask)) {
        setLocating(true);
        place = await position().catch(() => null);
      }
      const zone = ZONES[Intl.DateTimeFormat().resolvedOptions().timeZone] ?? FALLBACK;
      const lat = place?.lat ?? zone.lat;
      const lon = place?.lon ?? zone.lon;
      const city = place ? await cityAt(lat, lon) : zone.city;
      const next = await loadWeather(lat, lon, city);
      setWeather(next);
      write(WEATHER_KEY, next);
    } catch {
      // Без сети — останется то, что было в памяти.
    } finally {
      setLocating(false);
    }
  };

  const rates = official
    ? shown.codes
        .filter((code) => code !== shown.base)
        .map((code) => ({
          code,
          value: (crossRate(official, code, shown.base) ?? 0) * perFor(code),
          // Изменение за день есть только у курса к тенге.
          change: shown.base === "KZT" ? (official.change[code] ?? 0) * perFor(code) : undefined,
        }))
        .filter((x): x is { code: string; value: number; change: number | undefined } => !!x.value)
    : [];

  if (!weather && rates.length === 0) return <div className="h-9" aria-hidden />;
  const sky = weather ? describe(weather.code, weather.day) : null;

  return (
    <div className="animate-lift mt-3 flex flex-wrap items-center justify-center gap-2" style={{ animationDelay: `${delay}ms` }}>
      {weather && sky ? (
        <button
          onClick={() => void refreshWeather(true)}
          aria-label={`Погода: ${weather.city}, ${weather.temp}°, ${sky.text}. Нажмите, чтобы обновить по месту`}
          className="flex h-9 items-center gap-1.5 rounded-full pl-2 pr-3 text-[0.8125rem] transition active:scale-95"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <span style={{ color: weather.day && sky.icon.includes("sun") ? "#f59e0b" : "var(--accent)" }}>
            <Icon name={sky.icon} size={18} />
          </span>
          <span className="font-semibold tabular-nums">
            {weather.temp > 0 ? "+" : ""}
            {weather.temp}°
          </span>
          <span className="max-w-[7rem] truncate" style={{ color: "var(--muted)" }}>
            {locating ? "ищу…" : weather.city}
          </span>
        </button>
      ) : null}

      {rates.length ? (
        <span
          className="flex h-9 items-center gap-2.5 rounded-full px-3 text-[0.8125rem] tabular-nums"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          aria-label={`Курс Нацбанка: ${rates.map((r) => `${r.code} ${formatRate(r.value)}`).join(", ")}`}
        >
          {rates.map((r, i) => (
            <span key={r.code} className="flex items-center gap-2.5">
              {i > 0 ? <span className="h-3.5 w-px" style={{ background: "var(--border)" }} /> : null}
              <Rate sign={labelFor(r.code)} value={r.value} change={r.change} />
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** «$ 453,93 ▲» — стрелка, только если курс за день сдвинулся. */
function Rate({ sign, value, change }: { sign: string; value: number; change?: number }) {
  const moved = change && Math.abs(change) >= 0.005 ? change : 0;
  return (
    <span className="flex items-center gap-1">
      <span style={{ color: "var(--muted)" }}>{sign}</span>
      <span className="font-semibold">{formatRate(value)}</span>
      {moved ? (
        <span
          className="text-[0.625rem]"
          style={{ color: moved > 0 ? "var(--danger)" : "var(--ok)" }}
          aria-label={moved > 0 ? "вырос" : "снизился"}
        >
          {moved > 0 ? "▲" : "▼"}
        </span>
      ) : null}
    </span>
  );
}
