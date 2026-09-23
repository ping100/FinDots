"use client";

import { useEffect, useState } from "react";
import { Icon, PALETTE } from "@/lib/icons";
import { parseAmount } from "@/lib/money";
import type { Category, CategoryKind } from "@/lib/types";
import { useStore } from "./DataProvider";
import { Button, ColorPicker, Field, FieldGroup, IconPicker, Sheet, inputClass, inputStyle } from "./ui";

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
  const { categories, saveCategory, addSubcategory, deleteCategory } = useStore();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("circle");
  const [color, setColor] = useState(PALETTE[0]);
  const [limit, setLimit] = useState("");
  const [newSub, setNewSub] = useState("");
  const [planned, setPlanned] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setIcon(category?.icon ?? (kind === "income" ? "briefcase" : "cart"));
    setColor(category?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)]);
    setLimit(category?.monthly_limit != null ? String(category.monthly_limit) : "");
    setNewSub("");
    setPlanned(category?.planned_amount != null ? String(category.planned_amount) : "");
    setDueDay(category?.due_day != null ? String(category.due_day) : "");
  }, [open, category, kind]);

  const subs = category ? categories.filter((c) => c.parent_id === category.id) : [];

  const addSub = async () => {
    const name = newSub.trim();
    if (!name || !category) return;
    await addSubcategory(category.id, name);
    setNewSub("");
  };

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
        planned_amount: kind === "expense" ? parseAmount(planned) : null,
        due_day: kind === "expense" && planned && dueDay ? Number(dueDay) : null,
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
        <>
          <Field label="Лимит в месяц" hint="Потолок трат. Пусто — без лимита">
            <input
              className={inputClass}
              style={inputStyle}
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="например 60000"
            />
          </Field>

          {/* Обязательный платёж: аренда, подписка, интернет. Отличается от
              лимита тем, что эти деньги не свободны — их вычитают из
              «можно тратить сегодня», пока платёж не сделан. */}
          <Field
            label="Платёж каждый месяц"
            hint="Аренда, подписка, интернет. Эта сумма не попадёт в «можно тратить сегодня», пока не оплачена"
          >
            <input
              className={inputClass}
              style={inputStyle}
              inputMode="decimal"
              value={planned}
              onChange={(e) => setPlanned(e.target.value)}
              placeholder="пусто — платёж не регулярный"
            />
          </Field>

          {planned ? (
            <Field label="Число месяца" hint="Когда обычно платите — для напоминания">
              <input
                className={inputClass}
                style={inputStyle}
                inputMode="numeric"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                placeholder="10"
              />
            </Field>
          ) : null}
        </>
      ) : null}

      {/* Подкатегории заводятся и у существующей категории, и прямо в окне
          операции. Здесь их можно посмотреть целиком и лишние убрать. */}
      {category ? (
        <FieldGroup
          label="Подкатегории"
          hint="Уточнение внутри категории — «Продукты → магазин, базар». Выбирается при записи операции, на главной не показывается."
        >
          {subs.length ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {subs.map((sub) => (
                <span
                  key={sub.id}
                  className="flex items-center gap-1.5 rounded-full border py-1.5 pl-3.5 pr-1.5 text-sm"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
                >
                  {sub.name}
                  <button
                    onClick={() => deleteCategory(sub.id)}
                    aria-label={`Убрать «${sub.name}»`}
                    className="flex h-6 w-6 items-center justify-center rounded-full opacity-50 transition active:scale-90 active:opacity-100"
                  >
                    <Icon name="close" size={13} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <input
              className={inputClass}
              style={inputStyle}
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              placeholder={kind === "income" ? "Премия, аванс…" : "Магазин, базар…"}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                void addSub();
              }}
            />
            <button
              onClick={() => void addSub()}
              disabled={!newSub.trim()}
              className="shrink-0 rounded-2xl px-4 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--accent)" }}
            >
              Добавить
            </button>
          </div>
        </FieldGroup>
      ) : null}

      <ColorPicker value={color} onChange={setColor} />
      <IconPicker value={icon} color={color} onChange={setIcon} />
    </Sheet>
  );
}
