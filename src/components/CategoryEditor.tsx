"use client";

import { useEffect, useState } from "react";
import { PALETTE } from "@/lib/icons";
import { parseAmount } from "@/lib/money";
import type { Category, CategoryKind } from "@/lib/types";
import { useStore } from "./DataProvider";
import { Button, ColorPicker, Field, IconPicker, Sheet, inputClass, inputStyle } from "./ui";

export function CategoryEditor({
  open,
  kind,
  category,
  onClose,
}: {
  open: boolean;
  kind: CategoryKind;
  category?: Category | null;
  onClose: () => void;
}) {
  const { saveCategory, deleteCategory } = useStore();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("circle");
  const [color, setColor] = useState(PALETTE[0]);
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setIcon(category?.icon ?? (kind === "income" ? "briefcase" : "cart"));
    setColor(category?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)]);
    setLimit(category?.monthly_limit != null ? String(category.monthly_limit) : "");
  }, [open, category, kind]);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await saveCategory({
        id: category?.id,
        kind,
        name: name.trim(),
        icon,
        color,
        monthly_limit: kind === "expense" ? parseAmount(limit) : null,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={
        category
          ? "Категория"
          : kind === "income"
            ? "Новый источник дохода"
            : "Новая категория расхода"
      }
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <Button onClick={submit} disabled={!name.trim() || busy}>
            Сохранить
          </Button>
          {category ? (
            <Button
              variant="ghost"
              onClick={async () => {
                await deleteCategory(category.id);
                onClose();
              }}
            >
              Убрать с экрана
            </Button>
          ) : null}
        </div>
      }
    >
      <Field label="Название">
        <input
          className={inputClass}
          style={inputStyle}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === "income" ? "Подработка" : "Кофе"}
        />
      </Field>

      {kind === "expense" ? (
        <Field label="Лимит в месяц" hint="Пусто — без лимита">
          <input
            className={inputClass}
            style={inputStyle}
            inputMode="decimal"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="например 60000"
          />
        </Field>
      ) : null}

      <ColorPicker value={color} onChange={setColor} />
      <IconPicker value={icon} color={color} onChange={setIcon} />
    </Sheet>
  );
}
