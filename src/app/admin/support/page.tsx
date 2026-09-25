"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import { Loader } from "@/components/Loader";
import { Denied, useOverview } from "@/components/admin/shared";
import { SupportComposer, SupportThread } from "@/components/SupportThread";
import { Avatar } from "@/components/Avatar";
import { SUPPORT_POLL, loadThread, markRead, messageTime, sendMessage, type SupportMessage } from "@/lib/support";
import type { AdminUser } from "@/lib/admin";

/**
 * Обращения: список переписок и сама переписка — на одной странице.
 * Открытая переписка — состояние, а не отдельный адрес: переход между
 * списком и перепиской мгновенный, без повторной загрузки.
 */
export default function SupportPage() {
  const { data, denied } = useOverview();
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const reload = useCallback(async () => setMessages(await loadThread()), []);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, SUPPORT_POLL);
    return () => clearInterval(timer);
  }, [reload]);

  // Открыл переписку — всё в ней прочитано; и при каждом новом сообщении в ней.
  const openUnread = messages?.some((m) => m.user_id === open && !m.from_admin && !m.read_at);
  useEffect(() => {
    if (open && openUnread) void markRead(open).then(reload);
  }, [open, openUnread, reload]);

  const threads = useMemo(() => {
    const byUser = new Map<string, SupportMessage[]>();
    for (const message of messages ?? []) {
      byUser.set(message.user_id, [...(byUser.get(message.user_id) ?? []), message]);
    }
    return [...byUser.entries()]
      .map(([userId, list]) => ({
        userId,
        list,
        last: list[list.length - 1],
        unread: list.filter((m) => !m.from_admin && !m.read_at).length,
      }))
      .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [messages]);

  if (denied) return <Denied />;
  if (messages === null) return <Loader />;

  const who = (userId: string): AdminUser | undefined => data?.users.find((u) => u.id === userId);
  const name = (user: AdminUser | undefined) => user?.display_name || user?.email || "Пользователь";
  const current = open ? threads.find((t) => t.userId === open) : null;
  const person = open ? who(open) : undefined;

  if (open) {
    return (
      <div className="pt-safe mx-auto flex min-h-dvh w-full max-w-md flex-col px-4">
        <header className="flex items-center gap-2 py-3">
          <button
            onClick={() => setOpen(null)}
            aria-label="К списку обращений"
            className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full"
            style={{ color: "var(--muted)" }}
          >
            <Icon name="chevron-left" size={20} />
          </button>
          <Avatar url={person?.avatar_url} name={name(person)} size={36} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[1.125rem] font-semibold">
              {person?.number != null ? (
                <span className="mr-1.5 font-normal" style={{ color: "var(--muted)" }}>
                  ID {person.number}
                </span>
              ) : null}
              {name(person)}
            </h1>
            {person?.email ? (
              <p className="truncate text-[0.75rem]" style={{ color: "var(--muted)" }}>
                {person.email}
              </p>
            ) : null}
          </div>
        </header>

        <div className="flex-1">
          <SupportThread messages={current?.list ?? []} mineIsAdmin empty="Сообщений нет." />
        </div>

        <div className="pb-safe sticky bottom-0 -mx-4 px-4 pt-2" style={{ background: "var(--bg)" }}>
          <SupportComposer
            placeholder="Ответ"
            onSend={async (body) => {
              const error = await sendMessage(body, open);
              if (!error) await reload();
              return error;
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <header className="flex items-center gap-2 py-3">
        <Link
          href="/admin"
          aria-label="В админку"
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full"
          style={{ color: "var(--muted)" }}
        >
          <Icon name="chevron-left" size={20} />
        </Link>
        <h1 className="flex-1 text-[1.375rem] font-semibold">Обращения</h1>
      </header>

      {threads.length === 0 ? (
        <p className="rounded-2xl p-4 text-[0.8125rem] leading-snug" style={{ background: "var(--surface)", color: "var(--muted)" }}>
          Обращений пока нет. Люди пишут из настроек: «Написать администратору».
        </p>
      ) : (
        <div className="space-y-2">
          {threads.map((thread) => {
            const user = who(thread.userId);
            return (
              <button
                key={thread.userId}
                onClick={() => setOpen(thread.userId)}
                className="block w-full touch-manipulation rounded-2xl p-3.5 text-left transition active:scale-[0.99] [&_*]:pointer-events-none"
                style={{ background: "var(--surface)" }}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 truncate text-[0.9375rem] font-medium">
                    <Avatar url={user?.avatar_url} name={name(user)} size={26} />
                    {user?.number != null ? (
                      <span className="mr-1.5 font-normal tabular-nums" style={{ color: "var(--muted)" }}>
                        ID {user.number}
                      </span>
                    ) : null}
                    {name(user)}
                  </span>
                  <span className="shrink-0 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                    {messageTime(thread.last.created_at)}
                  </span>
                </span>
                <span className="mt-1 flex items-start gap-2">
                  <span className="line-clamp-2 min-w-0 flex-1 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
                    {thread.last.from_admin ? "Вы: " : ""}
                    {thread.last.body}
                  </span>
                  {thread.unread > 0 ? (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold tabular-nums text-white"
                      style={{ background: "var(--accent)" }}
                    >
                      {thread.unread}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
