"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { HomeCard } from "./HomeCard";
import { unreadSupport } from "./admin/SupportCard";

/**
 * Третья дверь на развилке — только для админа. Прятать её — удобство, а
 * не защита: сводку отдаёт база и сама проверяет, кто спрашивает.
 */
export function HomeAdminCard({ delay }: { delay: number }) {
  const [admin, setAdmin] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    createClient()
      .rpc("is_admin")
      .then(({ data }) => {
        if (alive) setAdmin(data === true);
        // Новые обращения видно прямо с развилки — не заходя в админку.
        if (data === true) void unreadSupport().then((n) => alive && setUnread(n));
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!admin) return null;
  return (
    <HomeCard
      href="/admin"
      title="Админка"
      hint={
        unread > 0
          ? `Новых обращений: ${unread}`
          : "Пользователи, кто онлайн, обращения, лимиты Supabase и Vercel"
      }
      icon="shield"
      color="#8b5cf6"
      delay={delay}
    />
  );
}
