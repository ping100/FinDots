"use client";

import { useEffect, useState } from "react";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { HomeCard } from "./HomeCard";
import { unreadSupport } from "./admin/SupportCard";

/**
 * Третья дверь на развилке — только для админа. Прятать её — удобство, а
 * не защита: сводку отдаёт база и сама проверяет, кто спрашивает.
 */
export function HomeAdminCard({ delay }: { delay: number }) {
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
