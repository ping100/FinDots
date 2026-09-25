"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";

/** Сколько сообщений от людей ещё не прочитано. RLS пускает к ним только админа. */
export async function unreadSupport(): Promise<number> {
  const { count } = await createClient()
    .from("support_messages")
    .select("id", { count: "exact", head: true })
    .eq("from_admin", false)
    .is("read_at", null);
  return count ?? 0;
}

/** Вход в обращения на главной админки — с числом новых. */
export function SupportCard() {
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    void unreadSupport().then(setUnread);
  }, []);

  return (
    <Link
      href="/admin/support"
      className="mb-2 flex touch-manipulation items-center gap-3 rounded-2xl p-3.5 transition active:scale-[0.99] [&_*]:pointer-events-none"
      style={{ background: "var(--surface)" }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: "#0ea5e9" }}
      >
        <Icon name="bell" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium">Обращения</span>
        <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          {unread === null ? "…" : unread === 0 ? "Новых нет" : "Есть непрочитанные"}
        </span>
      </span>
      {unread ? (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[0.75rem] font-semibold tabular-nums text-white"
          style={{ background: "var(--accent)" }}
        >
          {unread}
        </span>
      ) : null}
      <Icon name="chevron-right" size={16} className="opacity-30" />
    </Link>
  );
}
