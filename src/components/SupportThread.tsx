"use client";

import { useEffect, useRef, useState } from "react";
import { SUPPORT_MAX, messageTime, type SupportMessage } from "@/lib/support";

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
}: {
  onSend: (body: string) => Promise<string | null>;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const send = async () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setProblem(null);
    const error = await onSend(text);
    setBusy(false);
    if (error) setProblem(error);
    else setText("");
  };

  return (
    <div className="pb-3">
      {problem ? (
        <p className="mb-2 text-[0.75rem]" style={{ color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
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
          disabled={busy || !text.trim()}
          className="h-11 shrink-0 rounded-2xl px-4 text-[0.875rem] font-semibold text-white transition active:scale-95 disabled:opacity-40"
          style={{ background: "var(--accent)" }}
        >
          {busy ? "…" : "Отправить"}
        </button>
      </div>
    </div>
  );
}
