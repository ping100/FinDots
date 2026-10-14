"use client";

import { useState } from "react";
import { Loader } from "@/components/Loader";
import { Denied, Problem } from "@/components/admin/shared";
import { AdminHeader, useAdminRpc, type Announcement } from "@/components/admin/Tools";
import { inputClass, inputStyle } from "@/components/ui";
import { sinceLabel } from "@/lib/admin";

/**
 * Рассылка всем: объявление покажется полосой «Новости Dots» у каждого,
 * кто откроет приложение в ближайшие две недели, и (по желанию) придёт
 * пушем на все устройства с включёнными уведомлениями.
 */
export default function BroadcastPage() {
  const { data, denied, problem, reload } = useAdminRpc<Announcement[]>("admin_announcements");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [push, setPush] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (denied) return <Denied />;
  if (!data && !problem) return <Loader />;

  const ready = title.trim().length > 0 && body.trim().length > 0;

  const send = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, url: url.trim() || null, push }),
    });
    const out = (await res.json().catch(() => ({}))) as { sent?: number; total?: number; error?: string };
    setBusy(false);
    setConfirm(false);
    if (!res.ok) {
      setError(out.error ?? "Не получилось");
      return;
    }
    setResult(
      push
        ? `Отправлено. Пуш доставлен на ${out.sent} из ${out.total} устройств, полоса покажется всем при входе.`
        : "Отправлено. Полоса покажется всем при входе.",
    );
    setTitle("");
    setBody("");
    setUrl("");
    reload();
  };

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <AdminHeader title="Рассылка" />
      {problem ? <Problem text={problem} /> : null}

      <div className="space-y-2.5 rounded-2xl p-4" style={{ background: "var(--surface)" }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Заголовок — например, «Новый дизайн Findots»"
          className={inputClass}
          style={inputStyle}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={600}
          rows={4}
          placeholder="Текст: что нового или что случилось"
          className={`${inputClass} resize-none`}
          style={inputStyle}
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Ссылка, необязательно: /money или https://…"
          className={inputClass}
          style={inputStyle}
        />
        <label className="flex items-center gap-2.5 px-1 text-[0.875rem]">
          <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} className="h-4 w-4" />
          Ещё и пушем на телефоны
        </label>

        {ready ? (
          <div className="rounded-2xl px-3.5 py-3" style={{ border: "1px dashed var(--border)" }}>
            <p className="text-[0.625rem] font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
              Так увидят люди · Новости Dots
            </p>
            <p className="mt-0.5 text-[0.9375rem] font-semibold">{title}</p>
            <p className="mt-0.5 whitespace-pre-line text-[0.8125rem]" style={{ color: "var(--muted)" }}>
              {body}
            </p>
          </div>
        ) : null}

        {error ? <p className="text-[0.8125rem]" style={{ color: "var(--danger)" }}>{error}</p> : null}
        {result ? <p className="text-[0.8125rem]" style={{ color: "var(--ok)" }}>{result}</p> : null}

        {confirm ? (
          <div className="flex gap-2">
            <button
              onClick={() => void send()}
              disabled={busy}
              className="flex-1 rounded-2xl py-3 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--danger)" }}
            >
              {busy ? "Отправляю…" : "Да, отправить всем"}
            </button>
            <button
              onClick={() => setConfirm(false)}
              className="rounded-2xl px-4 py-3 text-sm font-semibold"
              style={{ background: "var(--surface-2)" }}
            >
              Отмена
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            disabled={!ready}
            className="w-full rounded-2xl py-3 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: "var(--accent)" }}
          >
            Отправить всем
          </button>
        )}
      </div>

      <h2 className="mb-2 mt-6 px-1 text-[0.9375rem] font-semibold">Прошлые рассылки</h2>
      {data && data.length === 0 ? (
        <p className="px-1 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
          Ещё не было
        </p>
      ) : null}
      <div className="space-y-2">
        {(data ?? []).map((a) => (
          <div key={a.id} className="rounded-2xl px-3.5 py-3" style={{ background: "var(--surface)" }}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[0.875rem] font-semibold">{a.title}</p>
              <p className="shrink-0 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                {sinceLabel(a.created_at)}
              </p>
            </div>
            <p className="mt-0.5 whitespace-pre-line text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
              {a.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
