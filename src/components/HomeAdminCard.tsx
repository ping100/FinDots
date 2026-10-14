"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { unreadSupport } from "./admin/SupportCard";

/**
 * Вход в админку на развилке — только для админа: небольшая стеклянная
 * плашка под орбитой, с числом новых обращений. Прятать её — удобство, а
 * не защита: сводку отдаёт база и сама проверяет, кто спрашивает.
 */
export function HomeAdminCard() {
  const admin = useIsAdmin();
  const [unread, setUnread] = useState(0);

  // Новые обращения видно прямо с развилки — не заходя в админку.
  useEffect(() => {
    if (!admin) return;
    let alive = true;
    void unreadSupport().then((n) => alive && setUnread(n));
    return () => {
      alive = false;
    };
  }, [admin]);

  if (!admin) return null;
  return (
    <Link
      href="/admin"
      className="glass animate-fade mx-auto flex h-10 w-max items-center gap-2 rounded-full pl-1.5 pr-3.5 text-[0.8125rem] font-semibold transition active:scale-95"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: "#8b5cf6" }}>
        <Icon name="shield" size={15} />
      </span>
      Админка
      {unread > 0 ? (
        <span className="rounded-full px-1.5 py-px text-[0.6875rem] tabular-nums text-white" style={{ background: "#ef4444" }}>
          {unread} {unread === 1 ? "новое" : "новых"}
        </span>
      ) : null}
    </Link>
  );
}
