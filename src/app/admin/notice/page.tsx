"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminHeader } from "@/components/admin/Tools";
import { inputClass, inputStyle } from "@/components/ui";

const PRESETS = [
  "Идёт обновление — 10–15 минут возможны перебои. Ваши данные в сохранности.",
  "Уведомления сейчас приходят с задержкой — уже чиним.",
  "Курс валют временно не обновляется — суммы считаются по последнему курсу.",
];

/** «Технические работы» — полоса у всех, пока не выключите. */
export default function NoticePage() {
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void createClient()
      .rpc("app_notice")
      .then(({ data }) => {
        setCurrent((data as string | null) ?? null);
        setText((data as string | null) ?? "");
      });
  }, []);

  const save = async (message: string | null) => {
    setBusy(true);
    setError(null);
    const { error: e } = await createClient().rpc("admin_set_notice", { p_message: message });
    setBusy(false);
    if (e) return setError(e.message);
    setCurrent(message?.trim() || null);
  };

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <AdminHeader back="/admin/care" title="Технические работы" />
      <div
        className="mb-3 rounded-2xl px-4 py-3 text-[0.875rem] font-medium"
        style={current ? { background: "#fffbeb", color: "#92400e", border: "1px solid #f59e0b" } : { background: "var(--surface)" }}
      >
        {current === undefined ? "…" : current ? "🛠 Включено — полосу видят все" : "Выключено — у людей всё как обычно"}
      </div>
      <div className="space-y-2.5 rounded-2xl p-4" style={{ background: "var(--surface)" }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={300}
          placeholder="Что сказать людям"
          className={`${inputClass} resize-none`}
          style={inputStyle}
        />
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setText(p)}
              className="rounded-full px-3 py-1.5 text-left text-[0.75rem]"
              style={{ background: "var(--surface-2)" }}
            >
              {p.split(" — ")[0]}
            </button>
          ))}
        </div>
        {error ? <p className="text-[0.8125rem]" style={{ color: "var(--danger)" }}>{error}</p> : null}
        <button
          onClick={() => void save(text)}
          disabled={busy || !text.trim()}
          className="w-full rounded-2xl py-3 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: "#f59e0b" }}
        >
          {current ? "Обновить текст" : "Включить полосу"}
        </button>
        {current ? (
          <button
            onClick={() => void save(null)}
            disabled={busy}
            className="w-full rounded-2xl py-3 text-sm font-semibold disabled:opacity-40"
            style={{ background: "var(--surface-2)" }}
          >
            Выключить — всё починили
          </button>
        ) : null}
      </div>
      <p className="mt-2 px-1 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
        Полоса появится у всех в течение пары минут — и у тех, кто ещё не вошёл. Закрыть её можно, но при следующем
        открытии она вернётся, пока режим включён.
      </p>
    </div>
  );
}
