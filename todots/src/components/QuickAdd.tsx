"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { addDays, today } from "@/lib/dates";
import type { Priority, Task } from "@/lib/types";
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
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  /** Заполненная — редактирование, null — новая задача. */
  task: Task | null;
  defaultDate: string;
  onSave: (task: Partial<Task> & { id?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string | null>(defaultDate);
  const [time, setTime] = useState("");
  const [remind, setRemind] = useState(false);
  const [priority, setPriority] = useState<Priority>("medium");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDate(task ? task.date : defaultDate);
    setTime(task?.time?.slice(0, 5) ?? "");
    setRemind(task?.remind ?? false);
    setPriority(task?.priority ?? "medium");
    setConfirming(false);
  }, [open, task, defaultDate]);

  /**
   * Время — выбор из двух состояний, а не поле, которое можно «не трогать».
   * Пустое системное поле времени на телефоне показывает текущий час, и
   * понять, задано время или нет, невозможно.
   */
  const setTimed = (on: boolean) => {
    if (on) {
      if (!time) setTime(new Date().toTimeString().slice(0, 5));
      return;
    }
    setTime("");
    setRemind(false);
  };

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onSave({
        id: task?.id,
        title: title.trim(),
        date,
        time: time || null,
        remind: !!time && remind,
        priority,
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
        <div className="space-y-2">
          <Button onClick={save} disabled={busy || !title.trim()}>
            {task ? "Сохранить" : "Добавить"}
          </Button>
          {/* Под «Сохранить», а не рядом: удаление не должно соперничать за
              палец с обычным действием. И в два нажатия — задача удаляется
              насовсем, вернуть её неоткуда. */}
          {task ? (
            <Button
              variant={confirming ? "danger" : "ghost"}
              onClick={async () => {
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                setBusy(true);
                await onDelete(task.id);
                setBusy(false);
                onClose();
              }}
              disabled={busy}
            >
              {confirming ? "Нажмите ещё раз — удалить насовсем" : "Удалить задачу"}
            </Button>
          ) : null}
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
        <input
          type="date"
          className={inputClass}
          style={inputStyle}
          value={date ?? ""}
          onChange={(e) => setDate(e.target.value || null)}
        />
      </FieldGroup>

      <FieldGroup label="Время">
        <div className="mb-2 flex flex-wrap gap-2">
          {[
            { label: "Без времени", on: false },
            { label: "Ко времени", on: true },
          ].map((option) => (
            <button
              key={option.label}
              onClick={() => setTimed(option.on)}
              className="rounded-full px-3 py-1.5 text-sm"
              style={{
                background: !!time === option.on ? "var(--accent)" : "var(--surface-2)",
                color: !!time === option.on ? "#fff" : "var(--text)",
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {time ? (
          <>
            <input
              type="time"
              className={inputClass}
              style={inputStyle}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
            <button
              onClick={() => setRemind((v) => !v)}
              aria-pressed={remind}
              className="mt-2 flex w-full items-center gap-2.5 rounded-2xl border px-4 py-3 text-left text-sm"
              style={{
                borderColor: remind ? "var(--accent)" : "var(--border)",
                background: remind ? "color-mix(in srgb, var(--accent) 12%, transparent)" : undefined,
              }}
            >
              <span style={{ color: remind ? "var(--accent)" : "var(--muted)" }}>
                <Icon name="bell" size={18} />
              </span>
              <span className="flex-1">
                Напомнить
                <span className="mt-0.5 block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                  {remind ? "Пришлём уведомление в это время" : "Просто запись, без уведомления"}
                </span>
              </span>
              {remind ? (
                <span style={{ color: "var(--accent)" }}>
                  <Icon name="check" size={18} />
                </span>
              ) : null}
            </button>
          </>
        ) : null}
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

    </Sheet>
  );
}
