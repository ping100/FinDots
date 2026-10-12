"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { applyLook } from "@/lib/look";
import { scaleFactor } from "@/lib/textScale";
import type { Profile } from "@/lib/types";
import type { FemDay, FemPeriod, FemSettings } from "@/lib/fem/cycle";

/**
 * Данные FemDots: настройки, отметки месячных и дни с самочувствием.
 * Всё своё — профиль общий с остальными приложениями только ради темы и
 * размера шрифта. Каждое изменение — сразу на экране, запись в базу
 * следом.
 */
export interface FemStore {
  ready: boolean;
  error: string | null;
  profile: Profile | null;
  /** null — FemDots ещё не настроен (нет согласия и первых ответов). */
  settings: FemSettings | null;
  periods: FemPeriod[];
  days: Map<string, FemDay>;

  saveSettings: (patch: Partial<FemSettings>) => Promise<void>;
  /** Начались месячные в этот день (end — если уже известно, когда закончились). */
  startPeriod: (day: string, end?: string | null) => Promise<void>;
  /** Закончились — последний день месячных. */
  endPeriod: (id: string, day: string) => Promise<void>;
  deletePeriod: (id: string) => Promise<void>;
  saveDay: (day: string, patch: Partial<Omit<FemDay, "day">>) => Promise<void>;
  deleteAll: () => Promise<void>;
}

const Ctx = createContext<FemStore | null>(null);

export function useFem(): FemStore {
  const store = useContext(Ctx);
  if (!store) throw new Error("useFem вне FemDots");
  return store;
}

const EMPTY_DAY = { flow: null, symptoms: [], mood: null, note: null };

export function FemProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<FemSettings | null>(null);
  const [periods, setPeriods] = useState<FemPeriod[]>([]);
  const [days, setDays] = useState<Map<string, FemDay>>(new Map());
  const daysRef = useRef(days);
  daysRef.current = days;
  // Для записи в базу — свежие настройки, а не замкнутые в колбэке.
  const settingsRef = useRef<FemSettings | null>(null);
  settingsRef.current = settings;

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) {
        setReady(true);
        return;
      }
      setUserId(user.id);
      const [p, s, per, d] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("fem_settings").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("fem_periods").select("id, start_date, end_date").order("start_date"),
        supabase.from("fem_days").select("day, flow, symptoms, mood, note").order("day").limit(3000),
      ]);
      const failed = [p, s, per, d].find((r) => r.error)?.error;
      if (failed) setError("Не получилось загрузить данные — проверьте интернет");
      if (p.data) setProfile(p.data as Profile);
      if (s.data) {
        const row = s.data as FemSettings;
        setSettings({ ...row, pill_at: row.pill_at.slice(0, 5) });
      }
      setPeriods((per.data ?? []) as FemPeriod[]);
      setDays(new Map(((d.data ?? []) as FemDay[]).map((x) => [x.day, x])));
      setReady(true);
    })();
  }, [supabase]);

  // Тема и размер шрифта — общие с остальными приложениями Dots.
  useEffect(() => {
    if (profile) applyLook(profile.theme, `${16 * scaleFactor(profile.text_scale)}px`);
  }, [profile]);

  const fail = useCallback((message: string | undefined) => {
    if (message) setError("Не получилось сохранить — проверьте интернет");
    else setError(null);
  }, []);

  const saveSettings: FemStore["saveSettings"] = useCallback(
    async (patch) => {
      if (!userId) return;
      const next: FemSettings = {
        cycle_length: 28,
        period_length: 5,
        remind_period: true,
        remind_fertile: false,
        pill_on: false,
        pill_at: "21:00",
        discreet: false,
        consent_at: new Date().toISOString(),
        ...settingsRef.current,
        ...patch,
      };
      settingsRef.current = next;
      setSettings(next);
      const res = await supabase.from("fem_settings").upsert({ user_id: userId, ...next }, { onConflict: "user_id" });
      fail(res.error?.message);
    },
    [fail, supabase, userId],
  );

  const startPeriod: FemStore["startPeriod"] = useCallback(
    async (day, end = null) => {
      if (!userId) return;
      const id = crypto.randomUUID();
      setPeriods((prev) => [...prev, { id, start_date: day, end_date: end }].sort((a, b) => a.start_date.localeCompare(b.start_date)));
      const res = await supabase.from("fem_periods").insert({ id, user_id: userId, start_date: day, end_date: end });
      if (res.error) setPeriods((prev) => prev.filter((p) => p.id !== id));
      fail(res.error?.message);
    },
    [fail, supabase, userId],
  );

  const endPeriod: FemStore["endPeriod"] = useCallback(
    async (id, day) => {
      setPeriods((prev) => prev.map((p) => (p.id === id ? { ...p, end_date: day } : p)));
      const res = await supabase.from("fem_periods").update({ end_date: day }).eq("id", id);
      fail(res.error?.message);
    },
    [fail, supabase],
  );

  const deletePeriod: FemStore["deletePeriod"] = useCallback(
    async (id) => {
      setPeriods((prev) => prev.filter((p) => p.id !== id));
      const res = await supabase.from("fem_periods").delete().eq("id", id);
      fail(res.error?.message);
    },
    [fail, supabase],
  );

  const saveDay: FemStore["saveDay"] = useCallback(
    async (day, patch) => {
      if (!userId) return;
      const next: FemDay = { day, ...EMPTY_DAY, ...daysRef.current.get(day), ...patch };
      const empty = !next.flow && next.symptoms.length === 0 && !next.mood && !next.note?.trim();
      setDays((prev) => {
        const map = new Map(prev);
        if (empty) map.delete(day);
        else map.set(day, next);
        return map;
      });
      // Пустой день не храним — нечего хранить.
      const res = empty
        ? await supabase.from("fem_days").delete().eq("day", day)
        : await supabase.from("fem_days").upsert({ user_id: userId, ...next }, { onConflict: "user_id,day" });
      fail(res.error?.message);
    },
    [fail, supabase, userId],
  );

  const deleteAll: FemStore["deleteAll"] = useCallback(async () => {
    if (!userId) return;
    const results = await Promise.all([
      supabase.from("fem_days").delete().eq("user_id", userId),
      supabase.from("fem_periods").delete().eq("user_id", userId),
      supabase.from("fem_settings").delete().eq("user_id", userId),
    ]);
    fail(results.find((r) => r.error)?.error?.message);
    setDays(new Map());
    setPeriods([]);
    setSettings(null);
  }, [fail, supabase, userId]);

  const value = useMemo<FemStore>(
    () => ({ ready, error, profile, settings, periods, days, saveSettings, startPeriod, endPeriod, deletePeriod, saveDay, deleteAll }),
    [ready, error, profile, settings, periods, days, saveSettings, startPeriod, endPeriod, deletePeriod, saveDay, deleteAll],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
