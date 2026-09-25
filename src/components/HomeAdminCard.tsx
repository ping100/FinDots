"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { HomeCard } from "./HomeCard";

/**
 * Третья дверь на развилке — только для админа. Прятать её — удобство, а
 * не защита: сводку отдаёт база и сама проверяет, кто спрашивает.
 */
export function HomeAdminCard({ delay }: { delay: number }) {
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
    <HomeCard
      href="/admin"
      title="Админка"
      hint="Пользователи, кто онлайн, лимиты Supabase и Vercel"
      icon="shield"
      color="#8b5cf6"
      delay={delay}
    />
  );
}
