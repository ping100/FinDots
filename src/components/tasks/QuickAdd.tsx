"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { addDays, today } from "@/lib/tasks/dates";
import { REPEATS, isoDow, repeatLabel } from "@/lib/tasks/repeat";
import type { ChecklistItem, Priority, Repeat, Task, TaskCategory } from "@/lib/tasks/types";
import { PushNudge } from "@/components/PushSettings";
import { Button, FieldGroup, Sheet, Switch, inputClass, inputStyle } from "@/components/ui";

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
  const [remind, setRemind] = useState(false);
  const [carry, setCarry] = useState(false);
  const [repeat, setRepeat] = useState<Repeat | null>(null);
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newItem, setNewItem] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDate(task ? task.date : defaultDate);
    setTime(task?.time?.slice(0, 5) ?? "");
    setRemind(task?.remind ?? false);
    setCarry(task?.carry_over ?? false);
    setRepeat(task?.repeat ?? null);
    setRepeatDays(task?.repeat === "weekly" ? task.repeat_days ?? [] : []);
    setNote(task?.note ?? "");
    setChecklist(task?.checklist ?? []);
    setNewItem("");
    setPriority(task?.priority ?? "medium");
    setCategoryId(task?.category_id ?? null);
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

  /** Пункт, набранный, но не добавленный кнопкой, — тоже в список. */
  const withPending = () =>
    newItem.trim() ? [...checklist, { id: crypto.randomUUID(), text: newItem.trim(), done: false }] : checklist;

  /**
   * Чек-лист уже созданной задачи сохраняется сразу: открыли «Купить
   * продукты» в магазине, отметили «молоко» — и закрыли, без «Сохранить».
   */
  const updateChecklist = (next: ChecklistItem[], persist: boolean) => {
    setChecklist(next);
    if (persist && task) void onSave({ id: task.id, checklist: next });
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
        carry_over: carry,
        repeat: date ? repeat : null,
        repeat_days:
          !date || !repeat
            ? null
            : repeat === "weekly"
              ? repeatDays.length
                ? [...repeatDays].sort()
                : [isoDow(date)]
              : repeat === "monthly"
                ? [Number(date.slice(8, 10))]
                : null,
        note: note.trim() || null,
        checklist: withPending(),
        // Другой день выбран вручную — пометка «перенесено с …» больше не нужна.
        carried_from: task && date === task.date ? task.carried_from : null,
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
        {date ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setCarry((v) => !v)}
            onKeyDown={(e) => e.key === "Enter" && setCarry((v) => !v)}
            className="mt-2 flex w-full cursor-pointer items-center gap-2.5 rounded-2xl border px-4 py-3 text-left text-sm"
            style={{
              borderColor: carry ? "var(--accent)" : "var(--border)",
              background: carry ? "color-mix(in srgb, var(--accent) 12%, transparent)" : undefined,
            }}
          >
            <span style={{ color: carry ? "var(--accent)" : "var(--muted)" }}>
              <Icon name="carry" size={18} />
            </span>
            <span className="flex-1">
              Переносить на следующий день
              <span className="mt-0.5 block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                {carry
                  ? "Не успели — задача сама переедет на следующий день"
                  : "Не успели — задача попадёт в «Пропущено»"}
              </span>
            </span>
            <Switch checked={carry} onChange={setCarry} label="Переносить на следующий день" />
          </div>
        ) : null}
      </FieldGroup>

      {date ? (
        <FieldGroup label="Повтор">
          <div className="flex flex-wrap gap-2">
            {REPEATS.map((option) => (
              <button
                key={option.label}
                onClick={() => setRepeat(option.value)}
                className="rounded-full px-3 py-1.5 text-sm"
                style={{
                  background: repeat === option.value ? "var(--accent)" : "var(--surface-2)",
                  color: repeat === option.value ? "#fff" : "var(--text)",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          {repeat === "weekly" ? (
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((label, i) => {
                const d = i + 1;
                const days = repeatDays.length ? repeatDays : [isoDow(date)];
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? days.filter((x) => x !== d) : [...days, d];
                      // Хотя бы один день: пустая неделя — это «не повторять».
                      if (next.length) setRepeatDays(next);
                    }}
                    className="rounded-xl py-2 text-[0.8125rem] font-medium transition active:scale-95"
                    style={{ background: on ? "var(--accent)" : "var(--surface-2)", color: on ? "#fff" : "var(--muted)" }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {repeat ? (
            <p className="mt-1.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              {`Повторяется ${repeatLabel({
                repeat,
                repeat_days: repeat === "weekly" ? (repeatDays.length ? repeatDays : [isoDow(date)]) : null,
                date,
              })}. Отметите выполненной — следующая появится сама.`}
            </p>
          ) : null}
        </FieldGroup>
      ) : null}

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
            {remind ? <PushNudge /> : null}
          </>
        ) : null}
      </FieldGroup>

      <FieldGroup label="Чек-лист">
        {checklist.length ? (
          <div className="mb-2 space-y-1">
            {checklist.map((item) => (
              <div key={item.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
                <button
                  aria-label={item.done ? "Не сделано" : "Сделано"}
                  onClick={() =>
                    updateChecklist(
                      checklist.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)),
                      true,
                    )
                  }
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-white transition active:scale-90"
                  style={{
                    background: item.done ? "var(--ok)" : "transparent",
                    border: `2px solid ${item.done ? "var(--ok)" : "var(--muted)"}`,
                  }}
                >
                  {item.done ? <Icon name="check" size={11} /> : null}
                </button>
                <span
                  className="min-w-0 flex-1 text-sm"
                  style={{ color: item.done ? "var(--muted)" : "var(--text)", textDecoration: item.done ? "line-through" : undefined }}
                >
                  {item.text}
                </span>
                <button
                  aria-label="Убрать пункт"
                  onClick={() => updateChecklist(checklist.filter((x) => x.id !== item.id), true)}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-base leading-none"
                  style={{ color: "var(--muted)" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2">
          <input
            className={inputClass}
            style={inputStyle}
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !newItem.trim()) return;
              e.preventDefault();
              updateChecklist(withPending(), true);
              setNewItem("");
            }}
            placeholder={checklist.length ? "Ещё пункт" : "Например, молоко"}
            maxLength={120}
          />
          <button
            aria-label="Добавить пункт"
            disabled={!newItem.trim() || checklist.length >= 50}
            onClick={() => {
              updateChecklist(withPending(), true);
              setNewItem("");
            }}
            className="flex w-12 shrink-0 items-center justify-center rounded-2xl text-white transition active:scale-95 disabled:opacity-40"
            style={{ background: "var(--accent)" }}
          >
            <Icon name="plus" size={18} />
          </button>
        </div>
      </FieldGroup>

      <FieldGroup label="Заметка">
        <textarea
          className={`${inputClass} min-h-[4.5rem] resize-y`}
          style={inputStyle}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Адрес, телефон, что взять с собой…"
          maxLength={2000}
        />
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
      ) : null}
    </Sheet>
  );
}
