"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";
import { useMe } from "@/lib/me";
import { Avatar } from "./Avatar";
import { GoogleMark } from "./GoogleButton";
import { Button, Sheet, inputClass, inputStyle } from "./ui";

/**
 * Карточка учётной записи в начале настроек: аватарка, имя, почта.
 * Нажатие — сменить имя: по нему приложение здоровается на развилке.
 *
 * Имя приходит сверху, из профиля приложения: после сохранения профиль
 * обновляется, и карточка вместе с ним. Почта и аватарка — из входа.
 */
export function AccountCard({
  name,
  hint,
  onSaveName,
}: {
  name: string | null | undefined;
  hint: string;
  onSaveName: (name: string) => Promise<void>;
}) {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const shown = name?.trim() || null;

  const save = async () => {
    const value = draft.trim();
    if (!value || busy) return;
    setBusy(true);
    await onSaveName(value.slice(0, 40));
    setBusy(false);
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => {
          setDraft(shown ?? "");
          setOpen(true);
        }}
        className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left [&:not(:first-child)]:border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <Avatar url={me?.avatar} name={shown ?? me?.email} size={52} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[1.0625rem] font-semibold">{shown ?? "Как вас зовут?"}</span>
          {me?.email ? (
            <span className="block truncate text-[0.8125rem]" style={{ color: "var(--muted)" }}>
              {me.email}
            </span>
          ) : null}
          <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
            {hint}
          </span>
        </span>
        <Icon name="chevron-right" size={16} className="opacity-30" />
      </button>

      <Sheet open={open} title="Ваше имя" onClose={() => setOpen(false)}>
        <form
          className="space-y-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            autoFocus
            autoComplete="given-name"
            maxLength={40}
            placeholder="Например, Алиса"
            className={inputClass}
            style={inputStyle}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          {me?.googleName && me.googleName !== draft.trim() ? (
            <button
              type="button"
              onClick={() => setDraft(me.googleName ?? "")}
              className="flex items-center gap-2 rounded-2xl px-3.5 py-2 text-[0.8125rem] font-medium transition active:scale-[0.98]"
              style={{ background: "var(--surface-2)" }}
            >
              <GoogleMark size={14} />
              Взять из Google: {me.googleName}
            </button>
          ) : null}
          <p className="text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
            По имени приложение здоровается: «Доброе утро, {draft.trim().split(/\s+/)[0] || "…"}».
            {me?.avatar ? " Фото — из вашего Google." : ""}
          </p>
          <Button type="submit" disabled={busy || !draft.trim()}>
            {busy ? "Сохраняю…" : "Сохранить"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
