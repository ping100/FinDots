"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { addDays, today } from "@/lib/dates";
import type { Priority, Task, TaskCategory } from "@/lib/types";
import { Button, FieldGroup, Sheet, inputClass, inputStyle } from "./ui";

const PRIORITIES: { value: Priority; color: string; label: string }[] = [
  { value: "low", color: "#8b97a8", label: "Низкий" },
  { value: "medium", color: "#f59e0b", label: "Средний" },
  { value: "high", color: "#ef4444", label: "Высокий" },
];

export function QuickAdd({
  open,
  onClose,
  task,
  defaultDate,
  categories,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  /** Заполненная — редактирование, null — новая задача. */
  task: Task | null;
  defaultDate: string;
  categories: TaskCategory[];
  onSave: (task: Partial<Task> & { id?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string | null>(defaultDate);
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDate(task ? task.date : defaultDate);
    setTime(task?.time?.slice(0, 5) ?? "");
    setPriority(task?.priority ?? "medium");
    setCategoryId(task?.category_id ?? null);
  }, [open, task, defaultDate]);

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onSave({
        id: task?.id,
        title: title.trim(),
        date,
        time: time || null,
        priority,
        category_id: categoryId,
        done: task?.done ?? false,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={task ? "Задача" : "Новая задача"}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {task ? (
            <Button
              variant="danger"
              className="w-auto px-4"
              onClick={async () => {
                setBusy(true);
                await onDelete(task.id);
                setBusy(false);
                onClose();
              }}
              disabled={busy}
            >
              <Icon name="close" size={18} />
            </Button>
          ) : null}
          <Button onClick={save} disabled={busy || !title.trim()}>
            {task ? "Сохранить" : "Добавить"}
          </Button>
        </div>
      }
    >
      <FieldGroup label="Что сделать">
        <input
          autoFocus
          className={inputClass}
          style={inputStyle}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например, позвонить в клинику"
          maxLength={200}
        />
      </FieldGroup>

      <FieldGroup label="Когда">
        <div className="mb-2 flex flex-wrap gap-2">
          {[
            { label: "Сегодня", value: today() },
            { label: "Завтра", value: addDays(today(), 1) },
            { label: "Без даты", value: null },
          ].map((option) => (
            <button
              key={option.label}
              onClick={() => setDate(option.value)}
              className="rounded-full px-3 py-1.5 text-sm"
              style={{
                background: date === option.value ? "var(--accent)" : "var(--surface-2)",
                color: date === option.value ? "#fff" : "var(--text)",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            className={inputClass}
            style={inputStyle}
            value={date ?? ""}
            onChange={(e) => setDate(e.target.value || null)}
          />
          <input
            type="time"
            className={inputClass}
            style={{ ...inputStyle, maxWidth: "8.5rem" }}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </FieldGroup>

      <FieldGroup label="Приоритет">
        <div className="flex gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              onClick={() => setPriority(p.value)}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm"
              style={{
                borderColor: priority === p.value ? p.color : "var(--border)",
                background: priority === p.value ? `${p.color}1a` : "transparent",
              }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
              {p.label}
            </button>
          ))}
        </div>
      </FieldGroup>

      {categories.length > 0 ? (
        <FieldGroup label="Категория" hint="Заводятся в Настройках">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategoryId(null)}
              className="rounded-full px-3 py-1.5 text-sm"
              style={{
                background: categoryId === null ? "var(--surface-2)" : "transparent",
                border: "1px solid var(--border)",
              }}
            >
              Без категории
            </button>
            {categories
              .filter((c) => !c.archived)
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-white"
                  style={{
                    background: c.color,
                    outline: categoryId === c.id ? "2px solid var(--text)" : "none",
                    outlineOffset: 2,
                  }}
                >
                  <Icon name={c.icon} size={13} />
                  {c.name}
                </button>
              ))}
          </div>
        </FieldGroup>
      ) : (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Категорий пока нет — их можно завести в Настройках.
        </p>
      )}
    </Sheet>
  );
}
