"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { rememberLook } from "@/lib/look";
import { scaleFactor } from "@/lib/textScale";
import type { Task } from "@/lib/tasks/types";
import type { Profile } from "@/lib/types";

export interface Store {
  ready: boolean;
  error: string | null;
  userId: string | null;
  profile: Profile | null;
  tasks: Task[];

  refresh: () => Promise<void>;

  saveTask: (task: Partial<Task> & { id?: string }) => Promise<void>;
  toggleDone: (id: string) => Promise<void>;
  /** Перенос драгом на другой кружок в ленте дат. */
  rescheduleTask: (id: string, date: string | null) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;


  saveProfile: (patch: Partial<Profile>) => Promise<void>;
}

function transient(message: string): boolean {
  return /jwt|token is expired|failed to fetch|network|fetch failed/i.test(message);
}

function human(message: string): string {
  if (transient(message)) return "Связь с сервером сорвалась — пробую ещё раз";
  if (/row-level security|permission denied/i.test(message)) {
    return "Нет доступа к этим данным — попробуйте войти заново";
  }
  return message;
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore вызван вне DataProvider");
  return store;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const supabase = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }, []);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = useCallback(async (retry = true) => {
    const {
      data: { user },
    } = await supabase().auth.getUser();
    if (!user) {
      setReady(true);
      return;
    }
    setUserId(user.id);

    const [p, t] = await Promise.all([
      supabase().from("profiles").select("*").eq("id", user.id).single(),
      supabase()
        .from("tasks")
        .select("*")
        .order("date", { ascending: true, nullsFirst: false })
        .order("time", { ascending: true, nullsFirst: false })
        .order("sort_order")
        .order("created_at")
        .limit(2000),
    ]);

    const firstError = [p, t].find((res) => res.error)?.error;
    if (firstError && transient(firstError.message) && retry) {
      await supabase().auth.refreshSession();
      await new Promise((done) => setTimeout(done, 600));
      return load(false);
    }
    if (firstError) setError(human(firstError.message));
    else setError(null);

    if (p.data) setProfile(p.data as Profile);
    setTasks((t.data ?? []) as Task[]);
    setReady(true);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // Профиль общий с деньгами, поэтому и вид общий: тема и кегль, выбранные
  // в одном приложении, действуют и в другом. Иначе человек, увеличивший
  // шрифт в деньгах, открывал бы задачи мелкими и не понимал почему.
  useEffect(() => {
    if (!profile) return;
    const fontSize = `${16 * scaleFactor(profile.text_scale)}px`;
    document.documentElement.classList.toggle("dark", profile.theme === "dark");
    document.documentElement.style.fontSize = fontSize;
    // Запоминаем на устройстве, чтобы в следующий раз экран ожидания
    // открылся сразу в нужном виде, не дожидаясь профиля.
    rememberLook(profile.theme, fontSize);
  }, [profile]);

  const refresh = useCallback(async () => {
    const t = await supabase()
      .from("tasks")
      .select("*")
      .order("date", { ascending: true, nullsFirst: false })
      .order("time", { ascending: true, nullsFirst: false })
      .order("sort_order")
      .order("created_at")
      .limit(2000);
    setTasks((t.data ?? []) as Task[]);
  }, [supabase]);

  const guard = useCallback(
    async (run: () => PromiseLike<{ error: { message: string } | null }>) => {
      setError(null);
      let { error: err } = await run();
      if (err && transient(err.message)) {
        await supabase().auth.refreshSession();
        await new Promise((done) => setTimeout(done, 600));
        ({ error: err } = await run());
      }
      if (err) {
        setError(human(err.message));
        throw new Error(human(err.message));
      }
      await refresh();
    },
    [refresh, supabase],
  );

  const saveTask: Store["saveTask"] = useCallback(
    async (task) => {
      const { id, ...fields } = task;
      await guard(() =>
        id
          ? supabase().from("tasks").update(fields).eq("id", id)
          : supabase().from("tasks").insert({ ...fields, user_id: userId }),
      );
    },
    [guard, supabase, userId],
  );

  const toggleDone: Store["toggleDone"] = useCallback(
    async (id) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      // Оптимистично: галочка должна откликаться сразу, а не после round-trip.
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
      try {
        await guard(() => supabase().from("tasks").update({ done: !task.done }).eq("id", id));
      } catch {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: task.done } : t)));
      }
    },
    [guard, supabase, tasks],
  );

  const rescheduleTask: Store["rescheduleTask"] = useCallback(
    async (id, date) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, date } : t)));
      await guard(() => supabase().from("tasks").update({ date }).eq("id", id));
    },
    [guard, supabase],
  );

  const deleteTask: Store["deleteTask"] = useCallback(
    async (id) => guard(() => supabase().from("tasks").delete().eq("id", id)),
    [guard, supabase],
  );

  const saveProfile: Store["saveProfile"] = useCallback(
    async (patch) => {
      if (!userId) return;
      const res = await supabase().from("profiles").update(patch).eq("id", userId);
      if (res.error) throw new Error(res.error.message);
      setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    [supabase, userId],
  );

  const value = useMemo<Store>(
    () => ({
      ready,
      error,
      userId,
      profile,
      tasks,
      refresh,
      saveTask,
      toggleDone,
      rescheduleTask,
      deleteTask,
      saveProfile,
    }),
    [
      ready, error, userId, profile, tasks, refresh,
      saveTask, toggleDone, rescheduleTask, deleteTask, saveProfile,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
