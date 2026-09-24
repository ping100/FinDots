"use client";

import { useEffect, useState } from "react";
import type { TaskCategory } from "@/lib/types";
import { Button, ColorPicker, Field, IconPicker, Sheet, inputClass, inputStyle } from "./ui";

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
        <div className="flex gap-2">
          {category ? (
            <Button
              variant="danger"
              className="w-auto px-4"
              onClick={async () => {
                setBusy(true);
                await onDelete(category.id);
                setBusy(false);
                onClose();
              }}
              disabled={busy}
            >
              Удалить
            </Button>
          ) : null}
          <Button onClick={save} disabled={busy || !name.trim()}>
            Сохранить
          </Button>
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
