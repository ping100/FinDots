"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/lib/icons";
import {
  SUPPORT_MAX,
  attachmentUrl,
  messageTime,
  uploadAttachment,
  type SupportMessage,
} from "@/lib/support";

/** Фото из переписки — бакет приватный, ссылку просим заново на каждый показ. */
function Attachment({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void attachmentUrl(path).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [path]);

  if (!url) {
    return (
      <div
        className="flex h-40 w-40 items-center justify-center rounded-xl"
        style={{ background: "rgba(255,255,255,0.15)" }}
      >
        <Icon name="camera" size={22} className="opacity-60" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- фото из приватного бакета, подписанная ссылка живёт час: next/image её бы закэшировал мимо срока
    <img src={url} alt="Фото" className="max-h-64 w-full rounded-xl object-cover" />
  );
}

/**
 * Лента переписки: свои сообщения справа, чужие слева. Общая для
 * человека в настройках и для админа в админке — отличается только тем,
 * какие сообщения считать своими.
 */
export function SupportThread({
  messages,
  mineIsAdmin,
  empty,
}: {
  messages: SupportMessage[];
  mineIsAdmin: boolean;
  empty: string;
}) {
  const end = useRef<HTMLDivElement>(null);

  // Новое сообщение — внизу, туда и прокручиваем.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <p className="py-6 text-center text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
        {empty}
      </p>
    );
  }

  return (
    <div className="selectable space-y-2 py-2">
      {messages.map((message) => {
        const mine = message.from_admin === mineIsAdmin;
        return (
          <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[0.875rem] leading-snug"
              style={
                mine
                  ? { background: "var(--accent)", color: "#fff", borderBottomRightRadius: 6 }
                  : { background: "var(--surface-2)", borderBottomLeftRadius: 6 }
              }
            >
              {message.attachment_path ? (
                <div className={message.body ? "mb-1.5" : undefined}>
                  <Attachment path={message.attachment_path} />
                </div>
              ) : null}
              {message.body}
              <span
                className="mt-1 block text-right text-[0.625rem]"
                style={{ opacity: 0.65 }}
              >
                {messageTime(message.created_at)}
              </span>
            </div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

/** Поле ввода с кнопкой. Enter — новая строка: на телефоне так привычнее. */
export function SupportComposer({
  onSend,
  placeholder,
  /** Чья переписка: кому принадлежит папка с фото. Без значения — своя. */
  threadUserId,
}: {
  onSend: (body: string, attachmentPath?: string | null) => Promise<string | null>;
  placeholder: string;
  threadUserId?: string;
}) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProblem("Можно только фото");
      return;
    }
    setProblem(null);
    setPhoto(file);
  };

  const send = async () => {
    if (busy || (!text.trim() && !photo)) return;
    setBusy(true);
    setProblem(null);
    try {
      let attachmentPath: string | null = null;
      if (photo) {
        const ownerId = threadUserId ?? (await createClient().auth.getUser()).data.user?.id;
        if (!ownerId) throw new Error("Нет пользователя");
        const { path, error } = await uploadAttachment(photo, ownerId);
        if (error) throw new Error(error);
        attachmentPath = path;
      }
      const error = await onSend(text, attachmentPath);
      if (error) {
        setProblem(error);
      } else {
        setText("");
        setPhoto(null);
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-3">
      {preview ? (
        <div className="mb-2 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- локальный превью-блоб, не из next/image-совместимого источника */}
          <img src={preview} alt="" className="h-16 w-16 rounded-xl object-cover" />
          <button
            onClick={() => setPhoto(null)}
            className="rounded-full px-3 py-1.5 text-[0.75rem] font-medium"
            style={{ background: "var(--surface-2)", color: "var(--danger)" }}
          >
            Убрать фото
          </button>
        </div>
      ) : null}
      {problem ? (
        <p className="mb-2 text-[0.75rem]" style={{ color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickPhoto(e.target.files?.[0])}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          aria-label="Прикрепить фото"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl disabled:opacity-40"
          style={{ background: "var(--surface-2)" }}
        >
          <Icon name="camera" size={19} />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, SUPPORT_MAX))}
          placeholder={placeholder}
          rows={Math.min(5, Math.max(1, text.split("\n").length))}
          className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-2xl border px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-[var(--accent)]"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
        />
        <button
          onClick={() => void send()}
          disabled={busy || (!text.trim() && !photo)}
          className="h-11 shrink-0 rounded-2xl px-4 text-[0.875rem] font-semibold text-white transition active:scale-95 disabled:opacity-40"
          style={{ background: "var(--accent)" }}
        >
          {busy ? "…" : "Отправить"}
        </button>
      </div>
    </div>
  );
}
