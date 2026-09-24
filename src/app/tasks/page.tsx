"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/lib/icons";
import { Loader } from "@/components/Loader";
import { Sheet, inputClass, inputStyle } from "@/components/ui";
import { PRIORITIES, dayLabel, group, isoDay, priorityOf, shortTime } from "@/lib/tasks";
import type { Task } from "@/lib/types";

const COLUMNS = "id, title, date, time, priority, done, sort_order, note, remind, created_at";

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState<Task | null>(null);
  const field = useRef<HTMLInputElement>(null);

  const supabase = useRef(createClient()).current;

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("tasks").select(COLUMNS);
    if (error) setProblem(error.message);
    else setTasks((data ?? []) as Task[]);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    // Показываем сразу, не дожидаясь сервера: список задач — это место, где
    // человек пишет очередью, и пауза после каждой строки сбивает с мысли.
    setDraft("");
    field.current?.focus();
    const { error } = await supabase
      .from("tasks")
      .insert({ user_id: auth.user.id, title, date: isoDay() });
    if (error) setProblem(error.message);
    await load();
  };

  const patch = async (task: Task, change: Partial<Task>) => {
    setTasks((was) => was?.map((t) => (t.id === task.id ? { ...t, ...change } : t)) ?? was);
    setOpen((was) => (was && was.id === task.id ? { ...was, ...change } : was));
    const { error } = await supabase.from("tasks").update(change).eq("id", task.id);
    if (error) {
      setProblem(error.message);
      await load();
    }
  };

  const remove = async (task: Task) => {
    setTasks((was) => was?.filter((t) => t.id !== task.id) ?? was);
    setOpen(null);
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) {
      setProblem(error.message);
      await load();
    }
  };

  if (tasks === null) return <Loader />;

  const groups = group(tasks);

  return (
    <div className="pb-8">
      {/* Поле ввода наверху: главное действие здесь — записать, пока не
          забыл, а не разглядывать уже записанное. */}
      <div className="mb-4 flex gap-2">
        <input
          ref={field}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="Что сделать?"
          className={`${inputClass} flex-1`}
          style={inputStyle}
        />
        <button
          onClick={() => void add()}
          disabled={!draft.trim()}
          aria-label="Добавить задачу"
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-2xl text-white transition active:scale-95 disabled:opacity-40"
          style={{ background: "var(--accent)" }}
        >
          <Icon name="plus" size={22} />
        </button>
      </div>

      {problem ? (
        <p className="mb-3 text-sm" style={{ color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <p className="py-16 text-center text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          Пока пусто.
          <br />
          Запишите первое дело — хоть «купить хлеб».
        </p>
      ) : null}

      {groups.map((section) => (
        <section key={section.id} className="mb-5">
          <h2
            className="mb-2 px-1 text-[0.8125rem] font-semibold"
            style={{ color: section.alarming ? "var(--danger)" : "var(--muted)" }}
          >
            {section.title}
            <span className="ml-1.5 font-normal opacity-60">{section.tasks.length}</span>
          </h2>

          <div className="overflow-hidden rounded-2xl" style={{ background: "var(--surface)" }}>
            {section.tasks.map((task) => (
              <Row
                key={task.id}
                task={task}
                showDate={section.id === "overdue" || section.id === "later" || section.id === "done"}
                onToggle={() => void patch(task, { done: !task.done })}
                onOpen={() => setOpen(task)}
              />
            ))}
          </div>
        </section>
      ))}

      {open ? (
        <Editor
          task={open}
          onClose={() => setOpen(null)}
          onPatch={(change) => void patch(open, change)}
          onRemove={() => void remove(open)}
        />
      ) : null}
    </div>
  );
}

function Row({
  task,
  showDate,
  onToggle,
  onOpen,
}: {
  task: Task;
  showDate: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const priority = priorityOf(task);
  const time = shortTime(task.time);
  const day = showDate ? dayLabel(task.date) : null;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 [&:not(:first-child)]:border-t"
      style={{ borderColor: "var(--border)" }}
    >
      {/* Кружок отдельной кнопкой: отметить сделанным — самое частое
          действие, и промахиваться по нему обиднее всего. */}
      <button
        onClick={onToggle}
        aria-label={task.done ? "Вернуть в работу" : "Отметить сделанным"}
        aria-pressed={task.done}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition active:scale-90"
        style={{
          borderColor: task.done ? "var(--ok)" : priority.color,
          background: task.done ? "var(--ok)" : "transparent",
          color: "#fff",
        }}
      >
        {task.done ? <Icon name="check" size={15} /> : null}
      </button>

      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span
          className="block truncate text-[0.9375rem]"
          style={{
            color: task.done ? "var(--muted)" : undefined,
            textDecoration: task.done ? "line-through" : undefined,
          }}
        >
          {task.title}
        </span>
        {time || day || task.note ? (
          <span
            className="mt-0.5 block truncate text-[0.6875rem]"
            style={{ color: "var(--muted)" }}
          >
            {[day, time, task.note].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </button>
    </div>
  );
}

function Editor({
  task,
  onClose,
  onPatch,
  onRemove,
}: {
  task: Task;
  onClose: () => void;
  onPatch: (change: Partial<Task>) => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? "");

  return (
    <Sheet open title="Задача" onClose={onClose}>
      <label className="mb-3 block">
        <span className="mb-1 block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          Что сделать
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && onPatch({ title: title.trim() })}
          className={inputClass}
          style={inputStyle}
        />
      </label>

      <div className="mb-3 flex gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            Дата
          </span>
          <input
            type="date"
            value={task.date ?? ""}
            onChange={(e) => onPatch({ date: e.target.value || null })}
            className={inputClass}
            style={inputStyle}
          />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            Время
          </span>
          <input
            type="time"
            value={shortTime(task.time) ?? ""}
            onChange={(e) => onPatch({ time: e.target.value || null })}
            className={inputClass}
            style={inputStyle}
          />
        </label>
      </div>

      <div className="mb-3" role="group" aria-label="Важность">
        <span className="mb-1 block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          Важность
        </span>
        <div className="flex gap-1.5">
          {PRIORITIES.map((p) => (
            <button
              key={p.id}
              onClick={() => onPatch({ priority: p.id })}
              aria-pressed={task.priority === p.id}
              className="flex-1 rounded-xl py-2 text-[0.8125rem] font-medium transition"
              style={{
                background: task.priority === p.id ? p.color : "var(--surface-2)",
                color: task.priority === p.id ? "#fff" : "var(--muted)",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <label className="mb-4 block">
        <span className="mb-1 block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          Заметка
        </span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (task.note ?? "") && onPatch({ note: note.trim() || null })}
          placeholder="Необязательно"
          className={inputClass}
          style={inputStyle}
        />
      </label>

      <button
        onClick={onRemove}
        className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium transition active:scale-[0.98]"
        style={{ background: "var(--surface-2)", color: "var(--danger)" }}
      >
        <Icon name="trash" size={17} />
        Удалить задачу
      </button>
    </Sheet>
  );
}
