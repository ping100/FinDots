"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import { Loader } from "@/components/Loader";
import { Denied, useOverview } from "@/components/admin/shared";
import { SupportComposer, SupportThread } from "@/components/SupportThread";
import { Avatar } from "@/components/Avatar";
import { Button, Sheet } from "@/components/ui";
import {
  SUPPORT_POLL,
  closeThread,
  closeThreadWithPush,
  loadHiddenThreads,
  loadThread,
  markRead,
  messageTime,
  sendMessage,
  setThreadHidden,
  type SupportMessage,
} from "@/lib/support";
import type { AdminUser } from "@/lib/admin";

/**
 * Обращения: список переписок и сама переписка — на одной странице.
 * Открытая переписка — состояние, а не отдельный адрес: переход между
 * списком и перепиской мгновенный, без повторной загрузки.
 */
export default function SupportPage() {
  const { data, denied } = useOverview();
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [hidden, setHidden] = useState<Map<string, string>>(new Map());
  const [open, setOpen] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [menuStage, setMenuStage] = useState<"closed" | "menu" | "confirm-silent" | "confirm-notify">("closed");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [list, hiddenMap] = await Promise.all([loadThread(), loadHiddenThreads()]);
    setMessages(list);
    setHidden(hiddenMap);
  }, []);

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
      .map(([userId, list]) => {
        const last = list[list.length - 1];
        const hiddenAt = hidden.get(userId);
        return {
          userId,
          list,
          last,
          unread: list.filter((m) => !m.from_admin && !m.read_at).length,
          // Скрыта, пока после отметки не пришло новое сообщение — тогда
          // переписка сама возвращается в общий список.
          isHidden: !!hiddenAt && last.created_at <= hiddenAt,
        };
      })
      .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [messages, hidden]);

  if (denied) return <Denied />;
  if (messages === null) return <Loader />;

  const who = (userId: string): AdminUser | undefined => data?.users.find((u) => u.id === userId);
  const name = (user: AdminUser | undefined) => user?.display_name || user?.email || "Пользователь";
  const current = open ? threads.find((t) => t.userId === open) : null;
  const person = open ? who(open) : undefined;
  const hiddenCount = threads.filter((t) => t.isHidden).length;
  const visibleThreads = threads.filter((t) => showHidden || !t.isHidden);

  const closeMenu = () => {
    setMenuStage("closed");
    setBusy(false);
  };

  const toggleHidden = async () => {
    if (!open || busy) return;
    setBusy(true);
    const error = await setThreadHidden(open, !current?.isHidden);
    setBusy(false);
    if (!error) {
      await reload();
      closeMenu();
      if (!current?.isHidden) setOpen(null); // скрыли — возвращаемся к списку
    }
  };

  const doClose = async (notify: boolean) => {
    if (!open || busy) return;
    setBusy(true);
    // С уведомлением — пуш напрямую, в базе после этого не остаётся ни
    // одной строки (в отличие от обычного ответа, который хранится).
    const error = notify ? await closeThreadWithPush(open) : await closeThread(open, false);
    setBusy(false);
    if (!error) {
      await reload();
      setOpen(null);
      closeMenu();
    }
  };

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
          <button
            onClick={() => setMenuStage("menu")}
            aria-label="Действия с перепиской"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ color: "var(--muted)" }}
          >
            <span className="text-lg leading-none">···</span>
          </button>
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

        <Sheet
          open={menuStage !== "closed"}
          title={menuStage === "menu" ? "Переписка" : "Удалить переписку"}
          onClose={closeMenu}
        >
          {menuStage === "menu" ? (
            <div className="space-y-4 pb-2">
              <div
                className="overflow-hidden rounded-2xl"
                style={{ border: "1px solid var(--border)" }}
              >
                <button
                  onClick={() => void toggleHidden()}
                  disabled={busy}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-50"
                >
                  <span className="flex-1">
                    <span className="block text-[0.9375rem]">
                      {busy ? "Выполняю…" : current?.isHidden ? "Показать в списке" : "Скрыть из списка"}
                    </span>
                    <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
                      {current?.isHidden
                        ? "Сообщения останутся, переписка вернётся в общий список"
                        : "Сообщения останутся — просто уйдёт из списка, пока не напишут снова"}
                    </span>
                  </span>
                </button>
              </div>

              <div>
                <p className="mb-1.5 text-[0.8125rem]" style={{ color: "var(--danger)" }}>
                  Опасно
                </p>
                <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--danger)" }}>
                  <button
                    onClick={() => setMenuStage("confirm-silent")}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                  >
                    <span className="flex-1">
                      <span className="block text-[0.9375rem]" style={{ color: "var(--danger)" }}>
                        Удалить без уведомления
                      </span>
                      <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
                        Все сообщения исчезнут насовсем, человек ничего не увидит
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => setMenuStage("confirm-notify")}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <span className="flex-1">
                      <span className="block text-[0.9375rem]" style={{ color: "var(--danger)" }}>
                        Удалить с уведомлением
                      </span>
                      <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
                        Всё исчезнет насовсем, в базе ничего не останется — придёт
                        только push «Обращение закрыто» (если уведомления включены)
                      </span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              <p className="text-sm leading-snug">
                {menuStage === "confirm-notify"
                  ? `Переписка с «${name(person)}» удалится насовсем, без следа в базе. Придёт push-уведомление «Обращение закрыто» — если у человека включены уведомления, иначе он ничего не увидит. Отменить нельзя.`
                  : `Переписка с «${name(person)}» удалится насовсем, без следа. Отменить нельзя.`}
              </p>
              <Button variant="danger" onClick={() => void doClose(menuStage === "confirm-notify")} disabled={busy}>
                {busy ? "Удаляю…" : "Удалить"}
              </Button>
              <Button variant="ghost" onClick={() => setMenuStage("menu")} disabled={busy}>
                Назад
              </Button>
            </div>
          )}
        </Sheet>
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
        <>
          {hiddenCount > 0 ? (
            <button
              onClick={() => setShowHidden((v) => !v)}
              className="mb-2 text-[0.8125rem]"
              style={{ color: "var(--accent)" }}
            >
              {showHidden ? "Скрыть скрытые" : `Показать скрытые (${hiddenCount})`}
            </button>
          ) : null}
          {visibleThreads.length === 0 ? (
            <p className="rounded-2xl p-4 text-[0.8125rem] leading-snug" style={{ background: "var(--surface)", color: "var(--muted)" }}>
              Все переписки скрыты.
            </p>
          ) : (
            <div className="space-y-2">
              {visibleThreads.map((thread) => {
                const user = who(thread.userId);
                return (
                  <button
                    key={thread.userId}
                    onClick={() => setOpen(thread.userId)}
                    className="block w-full touch-manipulation rounded-2xl p-3.5 text-left transition active:scale-[0.99] [&_*]:pointer-events-none"
                    style={{ background: "var(--surface)", opacity: thread.isHidden ? 0.55 : 1 }}
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
                        {thread.isHidden ? (
                          <span className="shrink-0 text-[0.625rem]" style={{ color: "var(--muted)" }}>
                            скрыта
                          </span>
                        ) : null}
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
        </>
      )}
    </div>
  );
}
