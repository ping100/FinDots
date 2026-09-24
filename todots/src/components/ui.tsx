"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ICON_GROUPS, Icon, PALETTE } from "@/lib/icons";

export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // Лист уезжает вниз, а не исчезает — 200мс он ещё держит снимок прошлого
  // содержимого, пока вызывающий код уже обнулил заголовок.
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const snapshot = useRef<{ title: string; children: ReactNode; footer?: ReactNode }>({
    title,
    children,
    footer,
  });
  if (open) snapshot.current = { title, children, footer };

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const timer = setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const view = open ? { title, children, footer } : snapshot.current;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="Закрыть"
        onClick={onClose}
        className={`absolute inset-0 bg-black/55 backdrop-blur-[2px] ${
          leaving ? "animate-fade-out" : "animate-fade"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={view.title}
        className={`relative flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl border-t sm:rounded-3xl sm:border ${
          leaving ? "animate-sheet-out" : "animate-sheet"
        }`}
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-semibold">{view.title}</h2>
          <button
            onClick={onClose}
            className="-mr-2 rounded-full p-2 opacity-60 transition active:scale-90 active:opacity-100"
            aria-label="Закрыть"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-2">{view.children}</div>
        {footer || view.footer ? (
          <div className="pb-safe px-5 pt-2">{view.footer}</div>
        ) : (
          <div className="pb-safe" />
        )}
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const styles: Record<string, string> = {
    primary: "text-white",
    ghost: "",
    danger: "text-white",
  };
  const bg: Record<string, string> = {
    primary: "var(--accent)",
    ghost: "var(--surface-2)",
    danger: "var(--danger)",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ background: bg[variant] }}
      className={`w-full rounded-2xl px-4 py-3.5 text-base font-semibold transition-transform duration-100 active:scale-[0.97] disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-sm" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function FieldGroup({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3" role="group" aria-label={label}>
      <span className="mb-1.5 block text-sm" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-2xl border px-4 py-3 outline-none focus:border-[var(--accent)]";

export const inputStyle = {
  background: "var(--surface-2)",
  borderColor: "var(--border)",
} as const;

/** Выбор из списка — категория задачи, день недели повтора и т.п. */
export function PickerSheet({
  open,
  title,
  options,
  onPick,
  onClose,
  addLabel,
  onAdd,
  empty,
}: {
  open: boolean;
  title: string;
  options: { id: string; name: string; caption?: string; color?: string; icon?: string }[];
  onPick: (id: string) => void;
  onClose: () => void;
  addLabel?: string;
  onAdd?: () => void;
  empty?: string;
}) {
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      footer={
        onAdd ? (
          <Button variant="ghost" onClick={onAdd}>
            {addLabel ?? "Добавить"}
          </Button>
        ) : undefined
      }
    >
      {options.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
          {empty ?? "Пока пусто"}
        </p>
      ) : (
        <div
          className="mb-2 overflow-hidden rounded-2xl"
          style={{ border: "1px solid var(--border)" }}
        >
          {options.map((option, index) => (
            <button
              key={option.id}
              onClick={() => onPick(option.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
              style={{ borderTop: index ? "1px solid var(--border)" : undefined }}
            >
              {option.icon ? (
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white"
                  style={{ background: option.color ?? "var(--accent)" }}
                >
                  <Icon name={option.icon} size={17} />
                </span>
              ) : null}
              <span className="flex-1 text-sm font-medium">{option.name}</span>
              {option.caption ? (
                <span className="text-sm" style={{ color: "var(--muted)" }}>
                  {option.caption}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <FieldGroup label="Цвет">
      <div className="flex flex-wrap gap-2">
        {PALETTE.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            aria-label={color}
            className="h-8 w-8 rounded-full"
            style={{
              background: color,
              outline: value === color ? "2px solid var(--text)" : "none",
              outlineOffset: 2,
            }}
          />
        ))}
      </div>
    </FieldGroup>
  );
}

export function IconPicker({
  value,
  color,
  onChange,
}: {
  value: string;
  color: string;
  onChange: (icon: string) => void;
}) {
  return (
    <FieldGroup label="Иконка">
      <div className="space-y-3">
        {ICON_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-1.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              {group.title}
            </p>
            <div className="grid grid-cols-6 gap-2">
              {group.icons.map((name) => (
                <button
                  key={name}
                  onClick={() => onChange(name)}
                  aria-label={name}
                  className="flex h-11 items-center justify-center rounded-xl transition"
                  style={{
                    background: value === name ? color : "var(--surface-2)",
                    color: value === name ? "#fff" : "var(--muted)",
                  }}
                >
                  <Icon name={name} size={21} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </FieldGroup>
  );
}
