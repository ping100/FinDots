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
import { rememberTheme } from "@/lib/look";
import type { Profile, Task, TaskCategory } from "@/lib/types";

export interface Store {
  ready: boolean;
  error: string | null;
  userId: string | null;
  profile: Profile | null;
  categories: TaskCategory[];
  tasks: Task[];

  refresh: () => Promise<void>;

  saveTask: (task: Partial<Task> & { id?: string }) => Promise<void>;
  toggleDone: (id: string) => Promise<void>;
  /** Перенос драгом на другой кружок в ленте дат. */
  rescheduleTask: (id: string, date: string | null) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  saveCategory: (category: Partial<TaskCategory> & { id?: string }) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

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
  const [categories, setCategories] = useState<TaskCategory[]>([]);
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

    const [p, c, t] = await Promise.all([
      supabase().from("profiles").select("*").eq("id", user.id).single(),
      supabase().from("task_categories").select("*").order("sort_order"),
      supabase()
        .from("tasks")
        .select("*")
        .order("date", { ascending: true, nullsFirst: false })
        .order("time", { ascending: true, nullsFirst: false })
        .order("sort_order")
        .order("created_at")
        .limit(2000),
    ]);

    const firstError = [p, c, t].find((res) => res.error)?.error;
    if (firstError && transient(firstError.message) && retry) {
      await supabase().auth.refreshSession();
      await new Promise((done) => setTimeout(done, 600));
      return load(false);
    }
    if (firstError) setError(human(firstError.message));
    else setError(null);

    if (p.data) setProfile(p.data as Profile);
    setCategories((c.data ?? []) as TaskCategory[]);
    setTasks((t.data ?? []) as Task[]);
    setReady(true);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profile) return;
    document.documentElement.classList.toggle("dark", profile.theme === "dark");
    // Запоминаем на устройстве, чтобы в следующий раз экран ожидания
    // открылся сразу в нужной теме, не дожидаясь профиля.
    rememberTheme(profile.theme);
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

  const reloadCategories = useCallback(async () => {
    const c = await supabase().from("task_categories").select("*").order("sort_order");
    setCategories((c.data ?? []) as TaskCategory[]);
  }, [supabase]);

  const saveCategory: Store["saveCategory"] = useCallback(
    async (category) => {
      const { id, ...fields } = category;
      const res = id
        ? await supabase().from("task_categories").update(fields).eq("id", id)
        : await supabase().from("task_categories").insert({ ...fields, user_id: userId });
      if (res.error) {
        setError(res.error.message);
        throw new Error(res.error.message);
      }
      await reloadCategories();
    },
    [reloadCategories, supabase, userId],
  );

  /** Категорию не удаляем физически — иначе задачи в истории теряют имя. */
  const deleteCategory: Store["deleteCategory"] = useCallback(
    async (id) => {
      const res = await supabase().from("task_categories").update({ archived: true }).eq("id", id);
      if (res.error) throw new Error(res.error.message);
      await reloadCategories();
    },
    [reloadCategories, supabase],
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
      categories,
      tasks,
      refresh,
      saveTask,
      toggleDone,
      rescheduleTask,
      deleteTask,
      saveCategory,
      deleteCategory,
      saveProfile,
    }),
    [
      ready, error, userId, profile, categories, tasks, refresh,
      saveTask, toggleDone, rescheduleTask, deleteTask, saveCategory, deleteCategory, saveProfile,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
