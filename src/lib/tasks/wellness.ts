"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { today } from "./dates";

/** Настройки «Здоровья»: вода и сон. Строка на человека — wellness_settings. */
export interface Wellness {
  water_on: boolean;
  water_from: string;
  water_to: string;
  water_every_min: number;
  water_goal: number;
  sleep_on: boolean;
  sleep_at: string;
  /** ISO: 1 — понедельник … 7 — воскресенье. */
  sleep_days: number[];
  sleep_prep_min: number;
  /** Утренняя сводка задач пушем. */
  summary_on: boolean;
  summary_at: string;
}

export const WELLNESS_DEFAULTS: Wellness = {
  water_on: false,
  water_from: "09:00",
  water_to: "21:00",
  water_every_min: 120,
  water_goal: 8,
  sleep_on: false,
  sleep_at: "23:00",
  sleep_days: [1, 2, 3, 4, 5, 6, 7],
  sleep_prep_min: 30,
  summary_on: false,
  summary_at: "08:00",
};

const FIELDS = Object.keys(WELLNESS_DEFAULTS).join(", ");

/** «09:00:00» из базы → «09:00» для полей ввода. */
const hm = (t: string) => t.slice(0, 5);

/**
 * Настройки и сегодняшние стаканы. Правка — сразу на экране, запись в
 * базу следом: переключатель не должен ждать сервера.
 */
export function useWellness() {
  const [settings, setSettings] = useState<Wellness | null>(null);
  const [glasses, setGlasses] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const day = useRef(today());
  // Текущие значения для записи в базу: из функции-обновления состояния их
  // не достать — React вызывает её, когда сочтёт нужным.
  const settingsRef = useRef<Wellness>(WELLNESS_DEFAULTS);
  const glassesRef = useRef(0);

  useEffect(() => {
    const supabase = createClient();
    // Без сети — последнее сохранённое на телефоне (и стаканы, если день тот же).
    const cached = readWellness();
    if (cached) {
      settingsRef.current = cached.settings;
      glassesRef.current = cached.day === day.current ? cached.glasses : 0;
      setSettings(cached.settings);
      setGlasses(glassesRef.current);
    }
    void Promise.all([
      supabase.from("wellness_settings").select(FIELDS).maybeSingle(),
      supabase.from("water_log").select("glasses").eq("day", day.current).maybeSingle(),
    ]).then(([s, w]) => {
      if (s.error || w.error) return;
      const row = s.data as Wellness | null;
      settingsRef.current = row
        ? {
            ...row,
            water_from: hm(row.water_from),
            water_to: hm(row.water_to),
            sleep_at: hm(row.sleep_at),
            summary_at: hm(row.summary_at),
          }
        : WELLNESS_DEFAULTS;
      glassesRef.current = (w.data as { glasses: number } | null)?.glasses ?? 0;
      // Стаканы, отмеченные без сети, ещё не на сервере — их счёт главнее.
      const waiting = readWellness();
      if (waiting?.unsent && waiting.day === day.current) glassesRef.current = waiting.glasses;
      setSettings(settingsRef.current);
      setGlasses(glassesRef.current);
      writeWellness({ settings: settingsRef.current, day: day.current, glasses: glassesRef.current, unsent: !!waiting?.unsent });
      if (waiting?.unsent) void sendGlasses();
    });
    const retry = () => void sendGlasses();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);

  const save = useCallback(async (patch: Partial<Wellness>) => {
    setProblem(null);
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    const cached = readWellness();
    writeWellness({ settings: next, day: day.current, glasses: glassesRef.current, unsent: !!cached?.unsent });
    const { data } = await createClient().auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    const { error } = await createClient()
      .from("wellness_settings")
      .upsert({ user_id: userId, ...next }, { onConflict: "user_id" });
    if (error) setProblem("Не получилось сохранить — проверьте интернет");
  }, []);

  /** +1 или −1 стакан. Выпитый стакан сдвигает и отсчёт до следующего напоминания. */
  const addGlass = useCallback(async (delta: 1 | -1) => {
    setProblem(null);
    const count = Math.max(0, Math.min(50, glassesRef.current + delta));
    glassesRef.current = count;
    setGlasses(count);
    // Сначала на телефон с пометкой «не отправлено»: без сети стакан не теряется.
    writeWellness({ settings: settingsRef.current, day: day.current, glasses: count, unsent: true });
    const supabase = createClient();
    const res = await sendGlasses();
    if (res === "offline") return;
    if (res === "failed") {
      setProblem("Стакан не сохранился — попробуйте ещё раз");
      return;
    }
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    if (delta > 0) {
      await supabase.from("wellness_settings").update({ water_reminded_at: new Date().toISOString() }).eq("user_id", userId);
    }
  }, []);

  return { settings, glasses, problem, save, addGlass };
}

// ───────── вода без сети ─────────

const WELLNESS_KEY = "dots:wellness";
interface WellnessCache {
  settings: Wellness;
  day: string;
  glasses: number;
  /** Стаканы отмечены без сети и ещё не ушли на сервер. */
  unsent: boolean;
}

function readWellness(): WellnessCache | null {
  try {
    const raw = localStorage.getItem(WELLNESS_KEY);
    return raw ? (JSON.parse(raw) as WellnessCache) : null;
  } catch {
    return null;
  }
}

function writeWellness(value: WellnessCache) {
  try {
    localStorage.setItem(WELLNESS_KEY, JSON.stringify(value));
  } catch {
    // Нет хранилища — без сети стаканы не сохранятся, как и раньше.
  }
}

/** Отправить стаканы, отмеченные без сети. Число — итоговое, повтор безопасен. */
async function sendGlasses(): Promise<"ok" | "offline" | "failed"> {
  const cache = readWellness();
  if (!cache?.unsent) return "ok";
  if (!navigator.onLine) return "offline";
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return "offline";
  const res = await supabase
    .from("water_log")
    .upsert({ user_id: userId, day: cache.day, glasses: cache.glasses }, { onConflict: "user_id,day" });
  if (res.error) return /fetch|network|load failed/i.test(res.error.message) ? "offline" : "failed";
  const now = readWellness();
  // Пока шла отправка, могли добавить ещё стакан — тогда пометку не снимаем.
  if (now && now.day === cache.day && now.glasses === cache.glasses) writeWellness({ ...now, unsent: false });
  return "ok";
}

/** «каждые 2 ч», «каждые 1,5 ч», «каждые 45 мин». */
export function everyLabel(min: number): string {
  if (min < 60) return `каждые ${min} мин`;
  const h = min / 60;
  return `каждые ${Number.isInteger(h) ? h : h.toLocaleString("ru-RU")} ч`;
}

export const WEEKDAYS = [
  { iso: 1, short: "Пн" },
  { iso: 2, short: "Вт" },
  { iso: 3, short: "Ср" },
  { iso: 4, short: "Чт" },
  { iso: 5, short: "Пт" },
  { iso: 6, short: "Сб" },
  { iso: 7, short: "Вс" },
];

/** «каждый день», «по будням», «по выходным», «Пн, Ср, Пт». */
export function daysLabel(days: number[]): string {
  const set = [...days].sort();
  if (set.length === 7) return "каждый день";
  if (set.join() === "1,2,3,4,5") return "по будням";
  if (set.join() === "6,7") return "по выходным";
  if (set.length === 0) return "дни не выбраны";
  return WEEKDAYS.filter((d) => set.includes(d.iso)).map((d) => d.short).join(", ");
}
