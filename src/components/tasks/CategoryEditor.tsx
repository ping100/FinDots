"use client";

import { useEffect, useState } from "react";
import type { TaskCategory } from "@/lib/tasks/types";
import { Button, ColorPicker, Field, IconPicker, Sheet, inputClass, inputStyle } from "@/components/ui";

/** Заводить и править категории задач: название, цвет, значок. */
export function CategoryEditor({
  open,
  onClose,
  category,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  /** null — новая категория. */
  category: TaskCategory | null;
  onSave: (category: Partial<TaskCategory> & { id?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("tag");
  const [color, setColor] = useState("#3b82f6");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setIcon(category?.icon ?? "tag");
    setColor(category?.color ?? "#3b82f6");
  }, [open, category]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave({ id: category?.id, name: name.trim(), icon, color });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={category ? "Категория" : "Новая категория"}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <Button onClick={save} disabled={busy || !name.trim()}>
            Сохранить
          </Button>
          {/* Не «удалить»: категория уезжает из списка, а задачи, которым её
              уже поставили, название не теряют. Подтверждать тут нечего. */}
          {category ? (
            <Button
              variant="ghost"
              onClick={async () => {
                setBusy(true);
                await onDelete(category.id);
                setBusy(false);
                onClose();
              }}
              disabled={busy}
            >
              Убрать из списка
            </Button>
          ) : null}
        </div>
      }
    >
      <Field label="Название">
        <input
          autoFocus
          className={inputClass}
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например, Работа"
          maxLength={40}
        />
      </Field>
      <ColorPicker value={color} onChange={setColor} />
      <IconPicker value={icon} color={color} onChange={setIcon} />
    </Sheet>
  );
}
