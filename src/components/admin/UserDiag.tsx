"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CURRENT_BUILD } from "@/lib/update";
import { sinceLabel } from "@/lib/admin";

interface Diag {
  build: string | null;
  ua: string | null;
  standalone: boolean | null;
  client_at: string | null;
  time_zone: string | null;
  days: string[];
  errors: { message: string; path: string | null; created_at: string; build: string | null }[];
}

/** «iPhone · Safari» из строки браузера — коротко, по-человечески. */
export function deviceOf(ua: string | null): string {
  if (!ua) return "неизвестно";
  const device = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? (ua.match(/Android [\d.]+;\s*([^;)]+)/)?.[1]?.trim() ?? "Android")
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "другое";
  const browser = /SamsungBrowser/.test(ua)
    ? "Samsung Internet"
    : /YaBrowser/.test(ua)
      ? "Яндекс Браузер"
      : /Edg\//.test(ua)
        ? "Edge"
        : /Firefox|FxiOS/.test(ua)
          ? "Firefox"
          : /CriOS|Chrome\//.test(ua)
            ? "Chrome"
            : /Safari/.test(ua)
              ? "Safari"
              : "браузер";
  return `${device} · ${browser}`;
}

/**
 * Диагностика человека — чтобы ответить на «у меня не работает» за минуту:
 * какая версия приложения, телефон, установлено ли, часовой пояс, когда
 * заходил и какие ошибки у него были. Его записей здесь нет.
 */
export function UserDiag({
  userId,
  pushDevices,
  onAskUpdate,
  busy,
}: {
  userId: string;
  pushDevices: number;
  onAskUpdate: () => void;
  busy: boolean;
}) {
  const [diag, setDiag] = useState<Diag | null>(null);

  useEffect(() => {
    let alive = true;
    setDiag(null);
    void createClient()
      .rpc("admin_user_diag", { p_user_id: userId })
      .then(({ data }) => {
        if (alive) setDiag(data as Diag);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  if (!diag) {
    return (
      <p className="text-[0.75rem]" style={{ color: "var(--muted)" }}>
        Диагностика…
      </p>
    );
  }

  const old = !!diag.build && diag.build !== CURRENT_BUILD && CURRENT_BUILD !== "dev";
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  const active = new Set(diag.days);

  return (
    <div className="rounded-2xl p-3.5" style={{ background: "var(--surface-2)" }}>
      <p className="mb-2 text-[0.8125rem] font-semibold">Диагностика</p>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.75rem]">
        <span style={{ color: "var(--muted)" }}>Версия</span>
        <span style={{ color: old ? "#d97706" : undefined }}>
          {diag.build ? (old ? `старая (${diag.build})` : `актуальная (${diag.build})`) : "ещё не известна"}
        </span>
        <span style={{ color: "var(--muted)" }}>Устройство</span>
        <span>{deviceOf(diag.ua)}</span>
        <span style={{ color: "var(--muted)" }}>Как открывает</span>
        <span>{diag.standalone == null ? "—" : diag.standalone ? "установлено как приложение" : "в браузере"}</span>
        <span style={{ color: "var(--muted)" }}>Часовой пояс</span>
        <span>{diag.time_zone ?? "не известен — напоминания по Алматы"}</span>
        <span style={{ color: "var(--muted)" }}>Уведомления</span>
        <span style={{ color: pushDevices ? undefined : "#dc2626" }}>
          {pushDevices ? `включены (${pushDevices})` : "выключены — пуши не дойдут"}
        </span>
        <span style={{ color: "var(--muted)" }}>Последний раз</span>
        <span>{diag.client_at ? sinceLabel(diag.client_at) : "—"}</span>
      </div>

      <p className="mb-1 mt-2.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        Заходил за 2 недели
      </p>
      <div className="flex gap-1">
        {days.map((d) => (
          <span
            key={d}
            title={d}
            className="h-3 flex-1 rounded-[4px]"
            style={{ background: active.has(d) ? "#0ea5e9" : "var(--border)" }}
          />
        ))}
      </div>

      {diag.errors.length ? (
        <>
          <p className="mb-1 mt-2.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            Его последние ошибки
          </p>
          <div className="space-y-1">
            {diag.errors.map((e, i) => (
              <p key={i} className="selectable break-words text-[0.6875rem] leading-snug">
                <span style={{ color: "#dc2626" }}>{sinceLabel(e.created_at)}</span> · {e.path} · {e.message}
              </p>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-2.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          Ошибок у него не было
        </p>
      )}

      {old && pushDevices ? (
        <button
          onClick={onAskUpdate}
          disabled={busy}
          className="mt-3 w-full rounded-xl py-2 text-[0.8125rem] font-semibold text-white disabled:opacity-50"
          style={{ background: "#d97706" }}
        >
          {busy ? "Отправляю…" : "Попросить обновиться — пушем"}
        </button>
      ) : null}
    </div>
  );
}
