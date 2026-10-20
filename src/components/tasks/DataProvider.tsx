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

export interface Store {
  ready: boolean;
  error: string | null;
  userId: string | null;
  profile: Profile | null;
  tasks: Task[];
  categories: TaskCategory[];

  refresh: () => Promise<void>;
  /** Изменений, ждущих связи. */
  pendingCount: number;

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

/** Наложить отложенные изменения на список с сервера — чтобы без сети и до отправки видно было своё. */
function applyOps(list: Task[], ops: OutOp[]): Task[] {
  let out = list;
  for (const op of ops) {
    if (op.t === "upsert" && op.table === "tasks") {
      for (const row of op.rows as unknown as Task[]) {
        out = out.some((t) => t.id === row.id) ? out.map((t) => (t.id === row.id ? { ...t, ...row } : t)) : [...out, row];
      }
    } else if (op.t === "update" && op.table === "tasks") {
      out = out.map((t) => (t.id === op.match.id ? ({ ...t, ...op.patch } as Task) : t));
    } else if (op.t === "delete" && op.table === "tasks") {
      out = out.filter((t) => t.id !== op.match.id);
    }
  }
  return out;
}

interface Snapshot {
  profile: Profile | null;
  categories: TaskCategory[];
  tasks: Task[];
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
  // Изменения без сети: лежат на телефоне, пока не уйдут на сервер.
  const [outbox, setOutbox] = useState<OutOp[]>([]);
  const outboxRef = useRef<OutOp[]>([]);
  outboxRef.current = outbox;

  const load = useCallback(async (retry = true) => {
    // Кто вошёл — из сохранённой сессии, без запроса к серверу входа:
    // proxy уже проверил вход по пути сюда, а доступ к строкам всё равно
    // решает база. Лишний круг до сервера — это полсекунды на мобильном.
    const {
      data: { session },
    } = await supabase()
      .auth.getSession()
      .catch(() => ({ data: { session: null } }));
    // Без сети сессия может не прочитаться (истёк токен) — тогда тот, кто входил последним.
    const uid = session?.user?.id ?? (online() ? null : lastUser());
    if (!uid) {
      setReady(true);
      return;
    }
    setUserId(uid);
    const queued = loadOutbox("tasks", uid);
    setOutbox(queued);

    // Без сети — сразу снимок с телефона.
    const fromSnapshot = async () => {
      const snap = await readSnapshot<Snapshot>("tasks", uid);
      if (snap) {
        setProfile(snap.profile);
        setCategories(snap.categories);
        setTasks(applyOps(snap.tasks, queued));
        setError(null);
      }
      setReady(true);
      return !!snap;
    };
    if (!online()) {
      await fromSnapshot();
      return;
    }
    const user = { id: uid };

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
    if (firstError && isNetworkError(firstError.message) && (await fromSnapshot())) return;
    if (firstError && transient(firstError.message) && retry) {
      await supabase().auth.refreshSession();
      await new Promise((done) => setTimeout(done, 600));
      return load(false);
    }
    if (firstError) setError(human(firstError.message));
    else setError(null);

    if (p.data) setProfile(p.data as Profile);
    setCategories((c.data ?? []) as TaskCategory[]);
    const list = carryOver((t.data ?? []) as Task[]);
    setTasks(applyOps(list, queued));
    setReady(true);
    if (!firstError) void writeSnapshot("tasks", uid, { profile: p.data ?? null, categories: c.data ?? [], tasks: list } satisfies Snapshot);
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
    // Сорвалось — оставляем то, что на экране: пустой список хуже устаревшего.
    if (t.error) return;
    const list = carryOver((t.data ?? []) as Task[]);
    setTasks(applyOps(list, outboxRef.current));
    if (userId) void writeSnapshot("tasks", userId, { profile, categories, tasks: list } satisfies Snapshot);
  }, [supabase, userId, profile, categories]);

  // Очередь — через ref, а не через функцию-обновлялку useState: отправка
  // читает её в цикле сразу после правки, а обновлялка выполнится позже.
  const updateOutbox = useCallback(
    (change: (ops: OutOp[]) => OutOp[]) => {
      const next = change(outboxRef.current);
      outboxRef.current = next;
      if (userId) saveOutbox("tasks", userId, next);
      setOutbox(next);
    },
    [userId],
  );

  /**
   * Записать изменения: со связью — сразу на сервер, без неё (или если
   * связь сорвалась) — в очередь. На экране они уже есть (оптимистично).
   */
  const write = useCallback(
    async (ops: OutOp[]) => {
      setError(null);
      if (!online()) {
        updateOutbox((q) => [...q, ...ops]);
        return;
      }
      for (let i = 0; i < ops.length; i++) {
        let { error: err } = await runOp(supabase(), ops[i]);
        if (err && transient(err.message) && !isNetworkError(err.message)) {
          await supabase().auth.refreshSession();
          ({ error: err } = await runOp(supabase(), ops[i]));
        }
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

  // Связь вернулась — отправляем очередь по порядку.
  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || !online() || outboxRef.current.length === 0) return;
    flushing.current = true;
    try {
      while (outboxRef.current.length) {
        const op = outboxRef.current[0];
        const { error: err } = await runOp(supabase(), op);
        if (err && isNetworkError(err.message)) break;
        // Отказ по существу (например, задачу уже удалили на другом
        // телефоне) — изменение бессмысленно крутить вечно.
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

  const saveTask: Store["saveTask"] = useCallback(
    async (task) => {
      const { id, ...fields } = task;
      // Правка существующей — сразу на экране (например, категория после
      // броска на плитку), сервер догоняет.
      if (id) {
        setTasks((prev) => prev.map((t) => (t.id === id ? ({ ...t, ...fields } as Task) : t)));
        await write([{ t: "update", table: "tasks", match: { id }, patch: fields }]);
        return;
      }
      // Новая — id задаём здесь: так её можно создать и без сети, а повтор не задвоит.
      const row = {
        title: "",
        date: null,
        time: null,
        remind: false,
        category_id: null,
        priority: "medium",
        done: false,
        sort_order: 0,
        note: null,
        carry_over: false,
        carried_from: null,
        repeat: null,
        repeat_days: null,
        repeat_parent: null,
        checklist: [],
        ...fields,
        id: crypto.randomUUID(),
        user_id: userId,
        created_at: new Date().toISOString(),
      } as unknown as Task;
      setTasks((prev) => [...prev, row]);
      const { created_at: _c, ...insert } = row as unknown as Record<string, unknown>;
      void _c;
      await write([{ t: "upsert", table: "tasks", rows: [insert] }]);
    },
    [write, userId],
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
        const ops: OutOp[] = [{ t: "update", table: "tasks", match: { id }, patch: { done } }];
        if (spawned) {
          const { created_at: _c, ...fields } = spawned as unknown as Record<string, unknown>;
          void _c;
          ops.push({ t: "upsert", table: "tasks", rows: [{ ...fields, user_id: userId }] });
        }
        for (const o of orphans) ops.push({ t: "delete", table: "tasks", match: { id: o } });
        await write(ops);
      } catch {
        setTasks((prev) => [
          ...prev.filter((t) => t.id !== spawned?.id).map((t) => (t.id === id ? { ...t, done: task.done } : t)),
          ...current.filter((t) => orphans.includes(t.id)),
        ]);
      }
    },
    [write, userId],
  );

  // Сами поставили день — пометка «перенесено с …» больше ни к чему.
  const rescheduleTask: Store["rescheduleTask"] = useCallback(
    async (id, date) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, date, carried_from: null } : t)));
      await write([{ t: "update", table: "tasks", match: { id }, patch: { date, carried_from: null } }]);
    },
    [write],
  );

  const rescheduleMany: Store["rescheduleMany"] = useCallback(
    async (ids, date) => {
      if (ids.length === 0) return;
      setTasks((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, date, carried_from: null } : t)));
      await write(ids.map((id) => ({ t: "update", table: "tasks", match: { id }, patch: { date, carried_from: null } })));
    },
    [write],
  );

  const deleteTask: Store["deleteTask"] = useCallback(
    async (id) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      await write([{ t: "delete", table: "tasks", match: { id } }]);
    },
    [write],
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
      pendingCount: outbox.length,
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
      ready, error, userId, profile, tasks, categories, refresh, outbox.length,
      saveTask, toggleDone, rescheduleTask, rescheduleMany, deleteTask, saveCategory, deleteCategory, saveProfile,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
