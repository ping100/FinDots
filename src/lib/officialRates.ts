"use client";

import { useEffect, useState } from "react";

/**
 * Валюты, которые можно показывать в строке курса (панель Findots и
 * главная). Курс по ним всегда официальный — /api/rates, Нацбанк РК.
 */
/** per — за сколько единиц показывать курс: мелкие валюты — за 1000, как в обменниках. */
export const RATE_CHOICES: { code: string; symbol: string; name: string; per?: number }[] = [
  { code: "USD", symbol: "$", name: "Доллар" },
  { code: "EUR", symbol: "€", name: "Евро" },
  { code: "RUB", symbol: "₽", name: "Рубль" },
  { code: "CNY", symbol: "¥", name: "Юань" },
  { code: "GBP", symbol: "£", name: "Фунт" },
  { code: "TRY", symbol: "₺", name: "Лира" },
  { code: "AED", symbol: "AED", name: "Дирхам" },
  { code: "THB", symbol: "฿", name: "Бат" },
  { code: "VND", symbol: "₫", name: "Донг", per: 1000 },
  { code: "KGS", symbol: "сом", name: "Сом" },
  { code: "UZS", symbol: "сум", name: "Узб. сум", per: 1000 },
  { code: "KZT", symbol: "₸", name: "Тенге" },
];
export const DEFAULT_SHOWN = ["USD", "RUB"];
export const MAX_SHOWN = 3;

export const symbolFor = (code: string) => RATE_CHOICES.find((c) => c.code === code)?.symbol ?? code;

/** За сколько единиц показывать: 1, а у донга и сума — 1000. */
export const perFor = (code: string) => RATE_CHOICES.find((c) => c.code === code)?.per ?? 1;

/** Подпись перед курсом: «$» или «1000 ₫». */
export const labelFor = (code: string) => {
  const per = perFor(code);
  return per > 1 ? `${per} ${symbolFor(code)}` : symbolFor(code);
};

export type Official = { kzt: Record<string, number>; change: Record<string, number>; at: number };

// v2 — с батом и донгом: в старой записи их нет.
const KEY = "dots.rates.official.v2";
const FRESH_MS = 30 * 60_000;

/**
 * Официальная таблица «сколько тенге за единицу». Сначала — из памяти
 * телефона (появляется сразу), потом, если устарела, свежая с сервера.
 */
export function useOfficialRates(): Official | null {
  const [data, setData] = useState<Official | null>(null);
  useEffect(() => {
    let cached: Official | null = null;
    try {
      cached = JSON.parse(localStorage.getItem(KEY) ?? "null");
    } catch {
      cached = null;
    }
    if (cached) setData(cached);
    if (cached && Date.now() - cached.at < FRESH_MS) return;
    let alive = true;
    fetch("/api/rates")
      .then((r) => r.json())
      .then((json: { kzt?: Record<string, number>; change?: Record<string, number> }) => {
        if (!alive || !json.kzt) return;
        const next = { kzt: json.kzt, change: json.change ?? {}, at: Date.now() };
        setData(next);
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          // Нет хранилища — в следующий раз просто спросим заново.
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

/** Курс code в base по официальной таблице (через тенге). */
export function crossRate(official: Official, code: string, base: string): number | null {
  const kzt = (c: string) => (c === "KZT" ? 1 : official.kzt[c]);
  const a = kzt(code);
  const b = kzt(base);
  return a && b ? a / b : null;
}

/** «453,93», а для мелких валют вроде сума — «0,0382». */
export function formatRate(value: number): string {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: value < 1 ? 4 : 2 });
}
