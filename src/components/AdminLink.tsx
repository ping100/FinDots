"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";

/**
 * Вход в админку — только для тех, кого база считает админом.
 *
 * Прятать ссылку — удобство, а не защита: сводку отдаёт функция в базе,
 * и она сама проверяет, кто спрашивает.
 */
export function AdminLink() {
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    createClient()
      .rpc("is_admin")
      .then(({ data }) => {
        if (alive) setAdmin(data === true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!admin) return null;
  return (
    <Link
      href="/admin"
      className="mb-4 flex items-center gap-3 rounded-2xl px-4 py-3 transition active:scale-[0.99]"
      style={{ background: "var(--surface)" }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: "#8b5cf6" }}
      >
        <Icon name="shield" size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem]">Админка</span>
        <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
          Пользователи, нагрузка и лимиты Supabase и Vercel
        </span>
      </span>
      <Icon name="chevron-right" size={16} className="opacity-30" />
    </Link>
  );
}
