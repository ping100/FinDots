"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/lib/icons";
import { SUPPORT_POLL, loadThread, markRead, sendMessage, type SupportMessage } from "@/lib/support";
import { Sheet } from "./ui";
import { SupportComposer, SupportThread } from "./SupportThread";

/**
 * «Написать администратору» в настройках.
 *
 * Переписка — прямо здесь: вопрос, ошибка, идея, просьба удалить аккаунт.
 * Ответ приходит сюда же, и на строке появляется отметка о нём. Админу
 * строка не нужна — у него переписки в админке.
 */
export function SupportRow() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);

  const reload = useCallback(async () => setMessages(await loadThread()), []);

  useEffect(() => {
    createClient()
      .rpc("is_admin")
      .then(({ data }) => setAdmin(data === true));
    void reload();
  }, [reload]);

  // Пока переписка открыта — подтягиваем ответы и отмечаем их прочитанными.
  useEffect(() => {
    if (!open) return;
    void markRead().then(reload);
    const timer = setInterval(() => void reload().then(() => markRead()), SUPPORT_POLL);
    return () => clearInterval(timer);
  }, [open, reload]);

  if (admin !== false) return null;

  const unread = messages.filter((m) => m.from_admin && !m.read_at).length;

  return (
    <div className="mb-4 overflow-hidden rounded-2xl" style={{ background: "var(--surface)" }}>
      <button onClick={() => setOpen(true)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="flex-1">
          <span className="block text-[0.9375rem]">Написать администратору</span>
          <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
            Вопрос, ошибка, идея или удалить аккаунт — ответ придёт сюда же
          </span>
        </span>
        {unread > 0 ? (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            {unread === 1 ? "новый ответ" : `ответов: ${unread}`}
          </span>
        ) : null}
        <Icon name="chevron-right" size={16} className="opacity-30" />
      </button>

      <Sheet
        open={open}
        title="Администратору"
        onClose={() => setOpen(false)}
        footer={
          <SupportComposer
            placeholder="Сообщение"
            onSend={async (body) => {
              const error = await sendMessage(body);
              if (!error) await reload();
              return error;
            }}
          />
        }
      >
        <SupportThread
          messages={messages}
          mineIsAdmin={false}
          empty="Здесь пока пусто. Напишите — администратор увидит сообщение у себя и ответит сюда же."
        />
      </Sheet>
    </div>
  );
}
