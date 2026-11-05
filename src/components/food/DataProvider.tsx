"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { unitOf } from "@/lib/food/units";
import { applyLook } from "@/lib/look";
import { scaleFactor } from "@/lib/textScale";
import { addDays, today } from "@/lib/tasks/dates";
import type { Profile } from "@/lib/types";
import type { DraftItem, FoodEntry, FoodSettings, Meal, Source, Workout } from "@/lib/food/types";
import {
  isNetworkError,
  lastUser,
  loadOutbox,
  online,
  readSnapshot,
  runOp,
  saveOutbox,
  writeSnapshot,
  type OutOp,
} from "@/lib/offline";

export interface FoodStore {
  ready: boolean;
  error: string | null;
  userId: string | null;
  profile: Profile | null;
  settings: FoodSettings | null;
  entries: FoodEntry[];
  /** Тренировки и шаги: сожжённое за день прибавляется к норме. */
  workouts: Workout[];
  /** Изменений, ждущих связи. */
  pendingCount: number;

  addEntries: (items: DraftItem[], meal: Meal, day: string, source: Source) => Promise<void>;
  updateEntry: (id: string, patch: Partial<FoodEntry>) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  /** Вернуть удалённое (кнопка «Вернуть» во всплывашке). */
  restoreEntry: (entry: FoodEntry) => Promise<void>;
  saveSettings: (patch: Partial<FoodSettings>) => Promise<void>;
  addWorkout: (w: Omit<Workout, "id" | "user_id" | "created_at">) => Promise<void>;
  updateWorkout: (id: string, patch: Partial<Workout>) => Promise<void>;
  deleteWorkout: (id: string) => Promise<void>;
  restoreWorkout: (w: Workout) => Promise<void>;
  saveProfile: (patch: Partial<Profile>) => Promise<void>;
}

/** Сколько истории держим на телефоне: для итогов и «недавнего» хватает. */
const HISTORY_DAYS = 120;

interface Snapshot {
  profile: Profile | null;
  settings: FoodSettings | null;
  entries: FoodEntry[];
  /** В старых снимках его нет. */
  workouts?: Workout[];
}

const human = (message: string) =>
  isNetworkError(message)
    ? "Связь с сервером сорвалась, пробую ещё раз"
    : /row-level security|permission denied/i.test(message)
      ? "Нет доступа к этим данным, попробуйте войти заново"
      : message;

/** Наложить отложенные изменения на список с сервера (еда или тренировки). */
function applyOps<T extends { id: string }>(list: T[], ops: OutOp[], table = "food_entries"): T[] {
  let out = list;
  for (const op of ops) {
    if (op.t === "upsert" && op.table === table) {
      for (const row of op.rows as unknown as T[]) {
        out = out.some((e) => e.id === row.id) ? out.map((e) => (e.id === row.id ? { ...e, ...row } : e)) : [...out, row];
      }
    } else if (op.t === "update" && op.table === table) {
      out = out.map((e) => (e.id === op.match.id ? ({ ...e, ...op.patch } as T) : e));
    } else if (op.t === "delete" && op.table === table) {
      out = out.filter((e) => e.id !== op.match.id);
    }
  }
  return out;
}

function settingsFromOps(settings: FoodSettings | null, ops: OutOp[]): FoodSettings | null {
  let out = settings;
  for (const op of ops) if (op.t === "upsert" && op.table === "food_settings") out = { ...(out ?? {}), ...(op.rows[0] as unknown as FoodSettings) };
  return out;
}

const FoodContext = createContext<FoodStore | null>(null);

export function useFood(): FoodStore {
  const store = useContext(FoodContext);
  if (!store) throw new Error("useFood вызван вне FoodProvider");
  return store;
}

export function FoodProvider({ children }: { children: ReactNode }) {
  const ref = useRef<SupabaseClient | null>(null);
  const supabase = useCallback(() => (ref.current ??= createClient()), []);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<FoodSettings | null>(null);
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [outbox, setOutbox] = useState<OutOp[]>([]);
  const outboxRef = useRef<OutOp[]>([]);
  outboxRef.current = outbox;
  const snapRef = useRef<Snapshot>({ profile: null, settings: null, entries: [] });

  const fetchEntries = useCallback(
    () =>
      supabase()
        .from("food_entries")
        .select("*")
        .gte("day", addDays(today(), -HISTORY_DAYS))
        .order("day")
        .order("created_at")
        .limit(5000),
    [supabase],
  );
  const fetchWorkouts = useCallback(
    () =>
      supabase()
        .from("food_workouts")
        .select("*")
        .gte("day", addDays(today(), -HISTORY_DAYS))
        .order("day")
        .order("created_at")
        .limit(3000),
    [supabase],
  );

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase()
      .auth.getSession()
      .catch(() => ({ data: { session: null } }));
    const uid = session?.user?.id ?? (online() ? null : lastUser());
    if (!uid) {
      setReady(true);
      return;
    }
    setUserId(uid);
    const queued = loadOutbox("food", uid);
    setOutbox(queued);

    const fromSnapshot = async () => {
      const snap = await readSnapshot<Snapshot>("food", uid);
      if (snap) {
        snapRef.current = snap;
        setProfile(snap.profile);
        setSettings(settingsFromOps(snap.settings, queued));
        setEntries(applyOps(snap.entries, queued));
        setWorkouts(applyOps(snap.workouts ?? [], queued, "food_workouts"));
      }
      setReady(true);
      return !!snap;
    };
    if (!online()) {
      await fromSnapshot();
      return;
    }
    const [p, s, e, w] = await Promise.all([
      supabase().from("profiles").select("*").eq("id", uid).single(),
      supabase().from("food_settings").select("*").eq("user_id", uid).maybeSingle(),
      fetchEntries(),
      fetchWorkouts(),
    ]);
    const firstError = [p, s, e].find((r) => r.error)?.error;
    if (firstError && isNetworkError(firstError.message) && (await fromSnapshot())) return;
    setError(firstError ? human(firstError.message) : null);
    if (p.data) setProfile(p.data as Profile);
    setSettings(settingsFromOps((s.data as FoodSettings | null) ?? null, queued));
    const list = (e.data ?? []) as FoodEntry[];
    setEntries(applyOps(list, queued));
    // Тренировки не главное: если их не удалось загрузить, еда всё равно работает.
    const wl = (w.data ?? []) as Workout[];
    setWorkouts(applyOps(wl, queued, "food_workouts"));
    setReady(true);
    if (!firstError) {
      snapRef.current = { profile: (p.data as Profile) ?? null, settings: (s.data as FoodSettings | null) ?? null, entries: list, workouts: wl };
      void writeSnapshot("food", uid, snapRef.current);
    }
  }, [fetchEntries, fetchWorkouts, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // Тема и кегль общие для всех приложений Dots.
  useEffect(() => {
    if (profile) applyLook(profile.theme, `${16 * scaleFactor(profile.text_scale)}px`);
  }, [profile]);

  const refresh = useCallback(async () => {
    const [e, s, w] = await Promise.all([
      fetchEntries(),
      userId ? supabase().from("food_settings").select("*").eq("user_id", userId).maybeSingle() : null,
      fetchWorkouts(),
    ]);
    if (e.error) return;
    const list = (e.data ?? []) as FoodEntry[];
    setEntries(applyOps(list, outboxRef.current));
    const wl = w.error ? null : ((w.data ?? []) as Workout[]);
    if (wl) setWorkouts(applyOps(wl, outboxRef.current, "food_workouts"));
    if (s && !s.error) setSettings(settingsFromOps((s.data as FoodSettings | null) ?? null, outboxRef.current));
    if (userId) {
      snapRef.current = { ...snapRef.current, entries: list, workouts: wl ?? snapRef.current.workouts, settings: s && !s.error ? ((s.data as FoodSettings | null) ?? null) : snapRef.current.settings };
      void writeSnapshot("food", userId, snapRef.current);
    }
  }, [fetchEntries, fetchWorkouts, supabase, userId]);

  const updateOutbox = useCallback(
    (change: (ops: OutOp[]) => OutOp[]) => {
      const next = change(outboxRef.current);
      outboxRef.current = next;
      if (userId) saveOutbox("food", userId, next);
      setOutbox(next);
    },
    [userId],
  );

  /** Со связью — сразу на сервер, без неё — в очередь. На экране уже есть. */
  const write = useCallback(
    async (ops: OutOp[]) => {
      setError(null);
      if (!online()) {
        updateOutbox((q) => [...q, ...ops]);
        return;
      }
      for (let i = 0; i < ops.length; i++) {
        const { error: err } = await runOp(supabase(), ops[i]);
        if (err && isNetworkError(err.message)) {
          updateOutbox((q) => [...q, ...ops.slice(i)]);
          return;
        }
        if (err) {
          setError(human(err.message));
          void refresh();
          throw new Error(human(err.message));
        }
      }
      await refresh();
    },
    [refresh, supabase, updateOutbox],
  );

  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || !online() || outboxRef.current.length === 0) return;
    flushing.current = true;
    try {
      while (outboxRef.current.length) {
        const { error: err } = await runOp(supabase(), outboxRef.current[0]);
        if (err && isNetworkError(err.message)) break;
        if (err) setError(`Изменение без сети не сохранилось: ${human(err.message)}`);
        updateOutbox((q) => q.slice(1));
      }
    } finally {
      flushing.current = false;
    }
    if (!outboxRef.current.length) await refresh();
  }, [refresh, supabase, updateOutbox]);

  useEffect(() => {
    if (outbox.length === 0) return;
    void flush();
    const retry = () => void flush();
    window.addEventListener("online", retry);
    const timer = setInterval(retry, 30_000);
    return () => {
      window.removeEventListener("online", retry);
      clearInterval(timer);
    };
  }, [outbox.length, flush]);

  const addEntries: FoodStore["addEntries"] = useCallback(
    async (items, meal, day, source) => {
      if (!userId || !items.length) return;
      const now = Date.now();
      const rows: FoodEntry[] = items.map((it, i) => ({
        id: crypto.randomUUID(),
        user_id: userId,
        day,
        meal,
        name: it.name.trim().slice(0, 120) || "Блюдо",
        grams: it.grams && it.grams > 0 ? Math.round(it.grams) : null,
        // Сохраняем как есть, чтобы потом не зависеть от угадывания по названию.
        unit: unitOf(it),
        kcal: Math.max(0, Math.round(it.kcal)),
        protein: Math.max(0, Math.round(it.protein * 10) / 10),
        fat: Math.max(0, Math.round(it.fat * 10) / 10),
        carbs: Math.max(0, Math.round(it.carbs * 10) / 10),
        source,
        // По порядку, как в списке распознанного.
        created_at: new Date(now + i).toISOString(),
      }));
      setEntries((prev) => [...prev, ...rows]);
      await write([{ t: "upsert", table: "food_entries", rows: rows as unknown as Record<string, unknown>[] }]);
    },
    [userId, write],
  );

  const updateEntry: FoodStore["updateEntry"] = useCallback(
    async (id, patch) => {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      await write([{ t: "update", table: "food_entries", match: { id }, patch }]);
    },
    [write],
  );

  const deleteEntry: FoodStore["deleteEntry"] = useCallback(
    async (id) => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      await write([{ t: "delete", table: "food_entries", match: { id } }]);
    },
    [write],
  );

  const restoreEntry: FoodStore["restoreEntry"] = useCallback(
    async (entry) => {
      setEntries((prev) => (prev.some((e) => e.id === entry.id) ? prev : [...prev, entry]));
      await write([{ t: "upsert", table: "food_entries", rows: [entry as unknown as Record<string, unknown>] }]);
    },
    [write],
  );

  const saveSettings: FoodStore["saveSettings"] = useCallback(
    async (patch) => {
      if (!userId) return;
      const next = { activity: "light", goal: "keep", sex: null, birth_year: null, height_cm: null, weight_kg: null, kcal_target: null, ...settings, ...patch, user_id: userId } as FoodSettings;
      setSettings(next);
      await write([{ t: "upsert", table: "food_settings", rows: [{ ...next, updated_at: new Date().toISOString() } as unknown as Record<string, unknown>], onConflict: "user_id" }]);
    },
    [settings, userId, write],
  );

  const addWorkout: FoodStore["addWorkout"] = useCallback(
    async (w) => {
      if (!userId) return;
      const row: Workout = { ...w, id: crypto.randomUUID(), user_id: userId, created_at: new Date().toISOString() };
      setWorkouts((prev) => [...prev, row]);
      await write([{ t: "upsert", table: "food_workouts", rows: [row as unknown as Record<string, unknown>] }]);
    },
    [userId, write],
  );

  const updateWorkout: FoodStore["updateWorkout"] = useCallback(
    async (id, patch) => {
      setWorkouts((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
      await write([{ t: "update", table: "food_workouts", match: { id }, patch }]);
    },
    [write],
  );

  const deleteWorkout: FoodStore["deleteWorkout"] = useCallback(
    async (id) => {
      setWorkouts((prev) => prev.filter((w) => w.id !== id));
      await write([{ t: "delete", table: "food_workouts", match: { id } }]);
    },
    [write],
  );

  const restoreWorkout: FoodStore["restoreWorkout"] = useCallback(
    async (w) => {
      setWorkouts((prev) => (prev.some((x) => x.id === w.id) ? prev : [...prev, w]));
      await write([{ t: "upsert", table: "food_workouts", rows: [w as unknown as Record<string, unknown>] }]);
    },
    [write],
  );

  const saveProfile: FoodStore["saveProfile"] = useCallback(
    async (patch) => {
      if (!userId) return;
      const res = await supabase().from("profiles").update(patch).eq("id", userId);
      if (res.error) throw new Error(human(res.error.message));
      setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    [supabase, userId],
  );

  const value = useMemo<FoodStore>(
    () => ({
      ready, error, userId, profile, settings, entries, workouts, pendingCount: outbox.length,
      addEntries, updateEntry, deleteEntry, restoreEntry, saveSettings,
      addWorkout, updateWorkout, deleteWorkout, restoreWorkout, saveProfile,
    }),
    [ready, error, userId, profile, settings, entries, workouts, outbox.length, addEntries, updateEntry, deleteEntry, restoreEntry, saveSettings, addWorkout, updateWorkout, deleteWorkout, restoreWorkout, saveProfile],
  );

  return <FoodContext.Provider value={value}>{children}</FoodContext.Provider>;
}
