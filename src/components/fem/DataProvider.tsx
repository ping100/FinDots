"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { applyLook } from "@/lib/look";
import { scaleFactor } from "@/lib/textScale";
import type { Profile } from "@/lib/types";
import type { FemDay, FemPeriod, FemSettings, Goal, Intim } from "@/lib/fem/cycle";

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

  userId: string | null;
  /** Сигналы между партнёрами за последние дни, новые сверху. */
  signals: FemSignal[];
  sendSignal: (kind: SignalKind, item?: string) => Promise<void>;
  markSignalsSeen: () => Promise<void>;
  /** Смахнуть / закрыть отвеченные: больше не показывать. */
  dismissSignals: (ids: number[]) => Promise<void>;
  /** Что ещё видит партнёр: статус, цель, напоминание про таблетку. */
  shareOptions: ShareOptions | null;
  setShareOptions: (next: ShareOptions) => Promise<void>;

  /** Близость по дням: общая для пары (сердечко у обоих). protected: null — не отмечено. */
  intimacy: Map<string, Intim>;
  /** Отметить / снять близость (null — снять). */
  setIntimacy: (day: string, value: Intim | null) => Promise<void>;
}

export type SignalKind = "care" | "buy" | "alone" | "heart" | "ok" | "custom";

export interface FemSignal {
  id: number;
  from_id: string;
  to_id: string;
  kind: SignalKind;
  item: string | null;
  created_at: string;
  seen_at: string | null;
  dismissed_at: string | null;
}

export interface ShareOptions {
  share_status: boolean;
  share_goal: boolean;
  pill_nudge: boolean;
}

/** Что видит партнёр: только чтение и только разрешённое. */
export interface PartnerView {
  owner_name: string;
  cycle_length: number;
  period_length: number;
  remind: boolean;
  share_mood: boolean;
  share_symptoms: boolean;
  share_status: boolean;
  /** На гормональной контрацепции — без фертильного окна. */
  hormonal: boolean;
  /** «Планируем беременность» — если она разрешила показывать цель. */
  goal: Goal | null;
  pill_nudge: boolean;
  periods: FemPeriod[];
  lh_days: string[];
  mucus_days: string[];
  /** Её самочувствие по дням — если делится; для прогноза. */
  symptom_days: { day: string; symptoms: string[] }[];
  /** Прогноз на паузе (беременность) — причину она скажет сама. */
  paused: boolean;
  intimacy: ({ day: string } & Intim)[];
  today: { mood: string | null; symptoms: string[]; status: string | null } | null;
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

const EMPTY_DAY = {
  flow: null,
  symptoms: [],
  mood: null,
  note: null,
  lh: null,
  temp: null,
  meds: [],
  pill: null,
  status: null,
  tags: [],
  weight: null,
  preg_test: null,
};

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
  const [signals, setSignals] = useState<FemSignal[]>([]);
  const [shareOptions, setShareOptionsState] = useState<ShareOptions | null>(null);
  const [intimacy, setIntimacyState] = useState<Map<string, Intim>>(new Map());

  const reloadShares = useCallback(async () => {
    const [view, mine, options] = await Promise.all([
      supabase.rpc("fem_partner_view"),
      supabase.rpc("fem_share_mine"),
      supabase.rpc("fem_share_settings"),
    ]);
    setPartner((view.data as PartnerView | null) ?? null);
    setShare(((mine.data ?? []) as MyShare[])[0] ?? null);
    setShareOptionsState((options.data as ShareOptions | null) ?? null);
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
      const intim = supabase
        .from("fem_intimacy")
        .select("day, protected, kinds, shared")
        .eq("active", true)
        .then((res) => {
          if (!res.error)
            setIntimacyState(
              new Map(
                (res.data ?? []).map((x) => [
                  x.day as string,
                  {
                    protected: x.protected as boolean | null,
                    kinds: (x.kinds ?? ["sex"]) as Intim["kinds"],
                    shared: (x.shared as boolean | null) ?? true,
                  },
                ]),
              ),
            );
        });
      const [p, s, per, d] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("fem_settings").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("fem_periods").select("id, start_date, end_date").order("start_date"),
        supabase.from("fem_days").select("day, flow, symptoms, mood, note, lh, temp, meds, pill, status, tags, weight, preg_test").order("day").limit(3000),
      ]);
      const failed = [p, s, per, d].find((r) => r.error)?.error;
      if (failed) setError("Не получилось загрузить данные — проверьте интернет");
      if (p.data) setProfile(p.data as Profile);
      if (s.data) {
        const row = s.data as FemSettings;
        setSettings({ ...row, pill_at: row.pill_at.slice(0, 5) });
      }
      setPeriods((per.data ?? []) as FemPeriod[]);
      setDays(
        new Map(
          ((d.data ?? []) as FemDay[]).map((x) => [
            x.day,
            {
              ...EMPTY_DAY,
              ...x,
              // Списки — всегда массивы, даже у старых строк.
              symptoms: x.symptoms ?? [],
              meds: x.meds ?? [],
              tags: x.tags ?? [],
              temp: x.temp == null ? null : Number(x.temp),
              weight: x.weight == null ? null : Number(x.weight),
            },
          ]),
        ),
      );
      await Promise.all([shares, intim]);
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
        goal: "track",
        method: "none",
        method_start: null,
        pack_active: 21,
        pack_break: 7,
        pregnant_since: null,
        ai_consent_at: null,
        custom_statuses: [],
        custom_asks: [],
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
      const empty =
        !next.flow &&
        next.symptoms.length === 0 &&
        !next.mood &&
        !next.note?.trim() &&
        !next.lh &&
        next.temp == null &&
        next.meds.length === 0 &&
        !next.pill &&
        !next.status &&
        next.tags.length === 0 &&
        next.weight == null &&
        !next.preg_test;
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
      supabase.from("fem_intimacy").delete().eq("owner_id", userId),
    ]);
    fail(results.find((r) => r.error)?.error?.message);
    setDays(new Map());
    setPeriods([]);
    setSettings(null);
    setShare(null);
    setIntimacyState(new Map());
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

  const loadSignals = useCallback(async () => {
    const since = new Date(Date.now() - 3 * 86400000).toISOString();
    const res = await supabase
      .from("fem_signals")
      .select("id, from_id, to_id, kind, item, created_at, seen_at, dismissed_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30);
    if (!res.error) setSignals((res.data ?? []) as FemSignal[]);
  }, [supabase]);

  // Сигналы пары: при входе и раз в 30 секунд, пока экран открыт.
  const paired = !!partner || !!share?.partner_name;
  useEffect(() => {
    if (!ready || !paired) return;
    void loadSignals();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadSignals();
    }, 30_000);
    return () => clearInterval(timer);
  }, [ready, paired, loadSignals]);

  const sendSignal: FemStore["sendSignal"] = useCallback(
    async (kind, item) => {
      const res = await supabase.rpc("fem_signal_send", { p_kind: kind, p_item: item ?? null });
      if (res.error) throw new Error(res.error.message);
      await loadSignals();
    },
    [loadSignals, supabase],
  );

  const markSignalsSeen: FemStore["markSignalsSeen"] = useCallback(async () => {
    if (!signals.some((x) => x.to_id === userId && !x.seen_at)) return;
    const now = new Date().toISOString();
    setSignals((prev) => prev.map((x) => (x.to_id === userId && !x.seen_at ? { ...x, seen_at: now } : x)));
    await supabase.rpc("fem_signals_seen");
  }, [signals, supabase, userId]);

  const dismissSignals: FemStore["dismissSignals"] = useCallback(
    async (ids) => {
      if (ids.length === 0) return;
      const now = new Date().toISOString();
      setSignals((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, dismissed_at: now, seen_at: x.seen_at ?? now } : x)));
      await supabase.rpc("fem_signals_dismiss", { p_ids: ids });
    },
    [supabase],
  );

  const setShareOptions: FemStore["setShareOptions"] = useCallback(
    async (next) => {
      setShareOptionsState(next);
      const res = await supabase.rpc("fem_share_options", {
        p_status: next.share_status,
        p_goal: next.share_goal,
        p_pill: next.pill_nudge,
      });
      fail(res.error?.message);
    },
    [fail, supabase],
  );

  const setIntimacy: FemStore["setIntimacy"] = useCallback(
    async (day, v) => {
      if (!userId) return;
      setIntimacyState((prev) => {
        const map = new Map(prev);
        if (v) map.set(day, v);
        else map.delete(day);
        return map;
      });
      const res = await supabase
        .from("fem_intimacy")
        .upsert(
          {
            owner_id: userId,
            day,
            protected: v?.protected ?? null,
            kinds: v?.kinds ?? [],
            shared: v?.shared ?? true,
            added_by: userId,
            active: !!v,
          },
          { onConflict: "owner_id,day" },
        );
      fail(res.error?.message);
    },
    [fail, supabase, userId],
  );

  const value = useMemo<FemStore>(
    () => ({
      ready, error, profile, settings, periods, days, saveSettings, saveProfile, startPeriod, endPeriod, deletePeriod, saveDay, deleteAll,
      partner, share, createShare, updateShare, revokeShare, acceptCode, leavePartner, setPartnerRemind, reloadShares,
      userId, signals, sendSignal, markSignalsSeen, dismissSignals, shareOptions, setShareOptions,
      intimacy, setIntimacy,
    }),
    [
      ready, error, profile, settings, periods, days, saveSettings, saveProfile, startPeriod, endPeriod, deletePeriod, saveDay, deleteAll,
      partner, share, createShare, updateShare, revokeShare, acceptCode, leavePartner, setPartnerRemind, reloadShares,
      userId, signals, sendSignal, markSignalsSeen, dismissSignals, shareOptions, setShareOptions,
      intimacy, setIntimacy,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
