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
import { applyLook } from "@/lib/look";
import { scaleFactor } from "@/lib/textScale";
import { today } from "@/lib/tasks/dates";
import { nextAfterDone } from "@/lib/tasks/repeat";
import type { Task, TaskCategory } from "@/lib/tasks/types";
import type { Profile } from "@/lib/types";

export interface Store {
  ready: boolean;
  error: string | null;
  userId: string | null;
  profile: Profile | null;
  tasks: Task[];
  categories: TaskCategory[];

  refresh: () => Promise<void>;

  saveTask: (task: Partial<Task> & { id?: string }) => Promise<void>;
  toggleDone: (id: string) => Promise<void>;
  /** Перенос драгом на другой кружок в ленте дат. */
  rescheduleTask: (id: string, date: string | null) => Promise<void>;
  /** «Всё на сегодня» из «Пропущено». */
  rescheduleMany: (ids: string[], date: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  saveCategory: (category: Partial<TaskCategory> & { id?: string }) => Promise<void>;
  /** Не удаляет физически — иначе задачи в истории теряют название категории. */
  deleteCategory: (id: string) => Promise<void>;

  saveProfile: (patch: Partial<Profile>) => Promise<void>;
}

/**
 * Задачи с «Переносить на следующий день», которые вчера не успели, сразу
 * показываем на сегодня и записываем это в базу. Сервер делает то же раз
 * в 10 минут — здесь только чтобы сразу после полуночи не ждать его.
 */
function carryOver(list: Task[]): Task[] {
  const now = today();
  const stale = list.filter((t) => t.carry_over && !t.done && t.date && t.date < now);
  if (stale.length === 0) return list;
  const db = createClient();
  for (const t of stale) {
    void db
      .from("tasks")
      .update({ date: now, carried_from: t.carried_from ?? t.date })
      .eq("id", t.id)
      .eq("done", false)
      .then(() => undefined);
  }
  return list.map((t) =>
    stale.includes(t) ? { ...t, date: now, carried_from: t.carried_from ?? t.date } : t,
  );
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
  // Свежий список для действий, вызванных позже рендера (например, «Вернуть»
  // во всплывашке): замкнутый в колбэке tasks к тому времени устарел.
  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks;
  const [categories, setCategories] = useState<TaskCategory[]>([]);

  const load = useCallback(async (retry = true) => {
    // Кто вошёл — из сохранённой сессии, без запроса к серверу входа:
    // proxy уже проверил вход по пути сюда, а доступ к строкам всё равно
    // решает база. Лишний круг до сервера — это полсекунды на мобильном.
    const {
      data: { session },
    } = await supabase().auth.getSession();
    const user = session?.user;
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
    setTasks(carryOver((t.data ?? []) as Task[]));
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
    // Заодно запоминаем на устройстве, чтобы в следующий раз экран ожидания
    // открылся сразу в нужном виде, не дожидаясь профиля.
    applyLook(profile.theme, fontSize);
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
    setTasks(carryOver((t.data ?? []) as Task[]));
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
      // Правка существующей — сразу на экране (например, категория после
      // броска на плитку), сервер догоняет.
      if (id) setTasks((prev) => prev.map((t) => (t.id === id ? ({ ...t, ...fields } as Task) : t)));
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
      const current = tasksRef.current;
      const task = current.find((t) => t.id === id);
      if (!task) return;
      const done = !task.done;
      // Повтор: выполнили — сразу появляется следующая. Отменили выполнение —
      // созданная из неё (если её ещё не выполнили) убирается.
      const next = done && task.repeat ? nextAfterDone(task) : null;
      const spawned: Task | null = next
        ? {
            ...task,
            id: crypto.randomUUID(),
            date: next,
            done: false,
            carried_from: null,
            repeat_parent: task.id,
            checklist: task.checklist.map((item) => ({ ...item, done: false })),
            created_at: new Date().toISOString(),
          }
        : null;
      const orphans = done ? [] : current.filter((t) => t.repeat_parent === id && !t.done).map((t) => t.id);

      // Оптимистично: галочка должна откликаться сразу, а не после round-trip.
      setTasks((prev) => [
        ...prev.filter((t) => !orphans.includes(t.id)).map((t) => (t.id === id ? { ...t, done } : t)),
        ...(spawned ? [spawned] : []),
      ]);
      try {
        await guard(async () => {
          const res = await supabase().from("tasks").update({ done }).eq("id", id);
          if (res.error) return res;
          if (spawned) {
            const { id: newId, ...fields } = spawned;
            return supabase().from("tasks").insert({ ...fields, id: newId, user_id: userId });
          }
          if (orphans.length) return supabase().from("tasks").delete().in("id", orphans);
          return res;
        });
      } catch {
        setTasks((prev) => [
          ...prev.filter((t) => t.id !== spawned?.id).map((t) => (t.id === id ? { ...t, done: task.done } : t)),
          ...current.filter((t) => orphans.includes(t.id)),
        ]);
      }
    },
    [guard, supabase, userId],
  );

  // Сами поставили день — пометка «перенесено с …» больше ни к чему.
  const rescheduleTask: Store["rescheduleTask"] = useCallback(
    async (id, date) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, date, carried_from: null } : t)));
      await guard(() => supabase().from("tasks").update({ date, carried_from: null }).eq("id", id));
    },
    [guard, supabase],
  );

  const rescheduleMany: Store["rescheduleMany"] = useCallback(
    async (ids, date) => {
      if (ids.length === 0) return;
      setTasks((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, date, carried_from: null } : t)));
      await guard(() => supabase().from("tasks").update({ date, carried_from: null }).in("id", ids));
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
      tasks,
      categories,
      refresh,
      saveTask,
      toggleDone,
      rescheduleTask,
      rescheduleMany,
      deleteTask,
      saveCategory,
      deleteCategory,
      saveProfile,
    }),
    [
      ready, error, userId, profile, tasks, categories, refresh,
      saveTask, toggleDone, rescheduleTask, rescheduleMany, deleteTask, saveCategory, deleteCategory, saveProfile,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
