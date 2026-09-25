"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GoogleMark } from "@/components/GoogleButton";
import { REFRESH, isOnline, plural, sinceLabel, type AdminOverview, type AdminUser } from "@/lib/admin";

/**
 * Сводка для админки: загрузка, отказ и тихое обновление раз в полминуты,
 * пока экран открыт. Общая для главной и для списков.
 *
 * Пускает сама база: функция отвечает отказом всем, кого нет в таблице
 * admins. Своей проверки здесь нет — она была бы лишь видимостью защиты.
 */
/**
 * Последняя сводка — на весь сеанс. Переход с главной админки в список и
 * обратно показывает её сразу, а свежую подтягивает тихо: иначе каждый
 * переход — белый экран ожидания и два запроса к базе.
 */
let cached: AdminOverview | null = null;

export function useOverview() {
  const [data, setData] = useState<AdminOverview | null>(cached);
  const [denied, setDenied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // quiet — фоновое обновление: без «Обновляю…» на кнопке каждые полминуты.
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
    setProblem(null);
    const supabase = createClient();
    // Сначала отмечаемся сами: общая отметка «я здесь» уходит параллельно
    // и могла опоздать — тогда админ, глядящий в админку, видел «онлайн 0».
    await supabase.rpc("touch_presence");
    const { data: overview, error } = await supabase.rpc("admin_overview");
    if (!quiet) setBusy(false);
    if (error) {
      // 42501 — «нет прав»: это ответ базы, а не сбой, и показывать его
      // надо иначе, чем обрыв связи.
      if (error.code === "42501") setDenied(true);
      else setProblem(error.message);
      return;
    }
    cached = overview as AdminOverview;
    setData(cached);
  }, []);

  useEffect(() => {
    void load(cached !== null);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, REFRESH);
    return () => clearInterval(timer);
  }, [load]);

  return { data, denied, problem, busy, reload: () => void load() };
}

export function Denied() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-lg font-semibold">Сюда нельзя</p>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Эта страница только для администратора.
      </p>
      <Link href="/" className="mt-2 text-sm" style={{ color: "var(--accent)" }}>
        На главную
      </Link>
    </div>
  );
}

export function Problem({ text }: { text: string }) {
  return (
    <p className="mb-4 rounded-2xl px-4 py-3 text-sm" style={{ background: "var(--surface)", color: "var(--danger)" }}>
      {text}
    </p>
  );
}

export function RefreshButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium disabled:opacity-50"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {busy ? "Обновляю…" : "Обновить"}
    </button>
  );
}

export function GeneratedAt({ iso }: { iso: string }) {
  return (
    <p className="mt-6 text-center text-[0.6875rem]" style={{ color: "var(--muted)" }}>
      Данные на {new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
    </p>
  );
}

/** Зелёная точка «в сети» — рядом всегда слово, одного цвета мало. */
export function OnlineDot() {
  return <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--ok)" }} />;
}

/** Карточка человека: только счётчики — ни сумм, ни названий, ни текстов. */
export function UserCard({ user, now }: { user: AdminUser; now: number }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[0.9375rem] font-medium">
          {user.number !== null ? (
            <span className="mr-1.5 font-normal tabular-nums" style={{ color: "var(--muted)" }}>
              ID {user.number}
            </span>
          ) : null}
          {user.display_name || user.email || "без имени"}
        </p>
        {isOnline(user, now) ? (
          <p className="flex shrink-0 items-center gap-1.5 text-[0.6875rem] font-medium">
            <OnlineDot />
            онлайн
          </p>
        ) : (
          <p className="shrink-0 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            был {sinceLabel(user.last_seen)}
          </p>
        )}
      </div>
      {user.display_name && user.email ? (
        <p className="truncate text-[0.75rem]" style={{ color: "var(--muted)" }}>
          {user.email}
        </p>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.75rem]">
        <span>
          <span style={{ color: "var(--muted)" }}>Деньги: </span>
          {user.transactions} {plural(user.transactions, "операция", "операции", "операций")}
        </span>
        <span>
          <span style={{ color: "var(--muted)" }}>Задачи: </span>
          {user.tasks_open} в работе, {user.tasks_done} сделано
        </span>
        <span>
          <span style={{ color: "var(--muted)" }}>Кошельков: </span>
          {user.wallets}
        </span>
        <span>
          <span style={{ color: "var(--muted)" }}>ИИ-разбор: </span>
          {user.has_ai_key ? `${user.ai_calls} ${plural(user.ai_calls, "раз", "раза", "раз")}` : "нет ключа"}
        </span>
        <span className="col-span-2 flex min-w-0 items-center gap-1.5">
          <span className="shrink-0" style={{ color: "var(--muted)" }}>Google:</span>
          {user.google_email ? (
            <>
              <GoogleMark size={12} />
              <span className="truncate">{user.google_email}</span>
            </>
          ) : (
            <span style={{ color: "var(--muted)" }}>не привязан</span>
          )}
        </span>
      </div>

      <p className="mt-2 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        появился {sinceLabel(user.created_at)}
        {user.providers.includes("email") ? "" : " · без пароля, только через Google"}
      </p>
    </div>
  );
}
