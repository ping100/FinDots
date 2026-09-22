"use client";

import { useEffect, type ReactNode } from "react";
import { Icon } from "@/lib/icons";

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet relative flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl border-t sm:rounded-3xl sm:border"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="-mr-2 rounded-full p-2 opacity-60 active:opacity-100"
            aria-label="Закрыть"
          >
            <Icon name="plus" size={20} className="rotate-45" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-2">{children}</div>
        {footer ? <div className="pb-safe px-5 pt-2">{footer}</div> : <div className="pb-safe" />}
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
      className={`w-full rounded-2xl px-4 py-3.5 text-base font-semibold transition active:scale-[0.98] disabled:opacity-40 ${styles[variant]} ${className}`}
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

export const inputClass =
  "w-full rounded-2xl border px-4 py-3 outline-none focus:border-[var(--accent)]";

export const inputStyle = {
  background: "var(--surface-2)",
  borderColor: "var(--border)",
} as const;

export function Bubble({
  icon,
  color,
  label,
  caption,
  size = 62,
  dimmed,
  highlighted,
  badge,
}: {
  icon: string;
  color: string;
  label: string;
  caption?: string;
  size?: number;
  dimmed?: boolean;
  highlighted?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`flex w-[76px] flex-col items-center gap-1.5 transition ${
        dimmed ? "opacity-35" : ""
      }`}
    >
      <div
        className="relative flex items-center justify-center rounded-full transition"
        style={{
          width: size,
          height: size,
          background: color + "26",
          color,
          boxShadow: highlighted
            ? `0 0 0 3px ${color}, 0 8px 24px ${color}55`
            : `inset 0 0 0 1.5px ${color}55`,
          transform: highlighted ? "scale(1.08)" : undefined,
        }}
      >
        <Icon name={icon} size={size * 0.44} />
        {badge ? (
          <span
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
            style={{ background: color }}
          >
            {badge}
          </span>
        ) : null}
      </div>
      <span className="w-full truncate text-center text-[11px] leading-tight">{label}</span>
      {caption ? (
        <span
          className="-mt-1 w-full truncate text-center text-[10px] leading-tight"
          style={{ color: "var(--muted)" }}
        >
          {caption}
        </span>
      ) : null}
    </div>
  );
}
