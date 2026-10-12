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
  /** Имя, тема, размер шрифта — общий профиль Dots. */
  saveProfile: (patch: Partial<Profile>) => Promise<void>;
  /** Начались месячные в этот день (end — если уже известно, когда закончились). */
  startPeriod: (day: string, end?: string | null) => Promise<void>;
  /** Закончились — последний день месячных. */
  endPeriod: (id: string, day: string) => Promise<void>;
  deletePeriod: (id: string) => Promise<void>;
  saveDay: (day: string, patch: Partial<Omit<FemDay, "day">>) => Promise<void>;
  deleteAll: () => Promise<void>;

  /** Чей цикл я смотрю как партнёр (null — ничей). */
  partner: PartnerView | null;
  /** Моё приглашение партнёру (null — не приглашала). */
  share: MyShare | null;
  createShare: (mood: boolean, symptoms: boolean) => Promise<void>;
  updateShare: (mood: boolean, symptoms: boolean) => Promise<void>;
  revokeShare: () => Promise<void>;
  /** Подключиться по коду. Возвращает имя владелицы или бросает понятную ошибку. */
  acceptCode: (code: string) => Promise<string>;
  leavePartner: () => Promise<void>;
  setPartnerRemind: (on: boolean) => Promise<void>;
  reloadShares: () => Promise<void>;
}

/** Что видит партнёр: только чтение и только разрешённое. */
export interface PartnerView {
  owner_name: string;
  cycle_length: number;
  period_length: number;
  remind: boolean;
  share_mood: boolean;
  share_symptoms: boolean;
  periods: FemPeriod[];
  today: { mood: string | null; symptoms: string[] } | null;
}

/** Приглашение, которое выдала владелица. */
export interface MyShare {
  code: string;
  partner_name: string | null;
  accepted_at: string | null;
  share_mood: boolean;
  share_symptoms: boolean;
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
  const [partner, setPartner] = useState<PartnerView | null>(null);
  const [share, setShare] = useState<MyShare | null>(null);

  const reloadShares = useCallback(async () => {
    const [view, mine] = await Promise.all([supabase.rpc("fem_partner_view"), supabase.rpc("fem_share_mine")]);
    setPartner((view.data as PartnerView | null) ?? null);
    setShare(((mine.data ?? []) as MyShare[])[0] ?? null);
  }, [supabase]);
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
      // Партнёрские данные — своим запросом, параллельно: их отсутствие не ошибка.
      const shares = reloadShares().catch(() => undefined);
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
      await shares;
      setReady(true);
    })();
  }, [supabase, reloadShares]);

  // Тема и размер шрифта — общие с остальными приложениями Dots.
  useEffect(() => {
    if (profile) applyLook(profile.theme, `${16 * scaleFactor(profile.text_scale)}px`);
  }, [profile]);

  const fail = useCallback((message: string | undefined) => {
    if (message) setError("Не получилось сохранить — проверьте интернет");
    else setError(null);
  }, []);

  const saveProfile: FemStore["saveProfile"] = useCallback(
    async (patch) => {
      if (!userId) return;
      setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
      const res = await supabase.from("profiles").update(patch).eq("id", userId);
      fail(res.error?.message);
    },
    [fail, supabase, userId],
  );

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
      supabase.rpc("fem_share_revoke"),
      supabase.from("fem_days").delete().eq("user_id", userId),
      supabase.from("fem_periods").delete().eq("user_id", userId),
      supabase.from("fem_settings").delete().eq("user_id", userId),
    ]);
    fail(results.find((r) => r.error)?.error?.message);
    setDays(new Map());
    setPeriods([]);
    setSettings(null);
    setShare(null);
  }, [fail, supabase, userId]);

  const createShare: FemStore["createShare"] = useCallback(
    async (mood, symptoms) => {
      const res = await supabase.rpc("fem_share_create", { p_mood: mood, p_symptoms: symptoms });
      fail(res.error?.message);
      await reloadShares();
    },
    [fail, reloadShares, supabase],
  );

  const updateShare: FemStore["updateShare"] = useCallback(
    async (mood, symptoms) => {
      setShare((prev) => (prev ? { ...prev, share_mood: mood, share_symptoms: symptoms } : prev));
      const res = await supabase.rpc("fem_share_update", { p_mood: mood, p_symptoms: symptoms });
      fail(res.error?.message);
    },
    [fail, supabase],
  );

  const revokeShare: FemStore["revokeShare"] = useCallback(async () => {
    setShare(null);
    const res = await supabase.rpc("fem_share_revoke");
    fail(res.error?.message);
  }, [fail, supabase]);

  const acceptCode: FemStore["acceptCode"] = useCallback(
    async (code) => {
      const res = await supabase.rpc("fem_share_accept", { p_code: code });
      // Текст ошибки пишет сама база — по-русски и по делу.
      if (res.error) throw new Error(res.error.message);
      await reloadShares();
      return res.data as string;
    },
    [reloadShares, supabase],
  );

  const leavePartner: FemStore["leavePartner"] = useCallback(async () => {
    setPartner(null);
    const res = await supabase.rpc("fem_partner_leave");
    fail(res.error?.message);
  }, [fail, supabase]);

  const setPartnerRemind: FemStore["setPartnerRemind"] = useCallback(
    async (on) => {
      setPartner((prev) => (prev ? { ...prev, remind: on } : prev));
      const res = await supabase.rpc("fem_partner_remind", { p_on: on });
      fail(res.error?.message);
    },
    [fail, supabase],
  );

  const value = useMemo<FemStore>(
    () => ({
      ready, error, profile, settings, periods, days, saveSettings, saveProfile, startPeriod, endPeriod, deletePeriod, saveDay, deleteAll,
      partner, share, createShare, updateShare, revokeShare, acceptCode, leavePartner, setPartnerRemind, reloadShares,
    }),
    [
      ready, error, profile, settings, periods, days, saveSettings, saveProfile, startPeriod, endPeriod, deletePeriod, saveDay, deleteAll,
      partner, share, createShare, updateShare, revokeShare, acceptCode, leavePartner, setPartnerRemind, reloadShares,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
