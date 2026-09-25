"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Номер пользователя в настройках: 1, 2, 3… по порядку регистрации.
 *
 * Нужен, чтобы назвать себя, не диктуя почту: «у меня ID 12, не
 * открывается отчёт». Нажатие копирует — в переписке так проще, чем
 * перепечатывать.
 */
export function UserNumber() {
  const [number, setNumber] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    createClient()
      .from("user_numbers")
      .select("number")
      .maybeSingle()
      .then(({ data }) => setNumber(data?.number ?? null));
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (number === null) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(number));
      setCopied(true);
    } catch {
      // Буфер обмена бывает закрыт — номер и так на экране.
    }
  };

  return (
    <button
      onClick={() => void copy()}
      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left [&:not(:first-child)]:border-t"
      style={{ borderColor: "var(--border)" }}
    >
      <span className="min-w-0">
        <span className="block text-[0.9375rem]">Ваш ID</span>
        <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
          {copied ? "Скопирован" : "Номер учётной записи — нажмите, чтобы скопировать"}
        </span>
      </span>
      <span className="shrink-0 text-[0.9375rem] font-semibold tabular-nums">{number}</span>
    </button>
  );
}
