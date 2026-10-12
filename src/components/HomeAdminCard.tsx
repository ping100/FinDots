"use client";

import { useEffect, useRef, useState } from "react";
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
  // Карточка появляется после ответа базы — позже остальных. Задержку её
  // появления считаем от открытия страницы, а не от своего появления, иначе
  // она ждала бы ещё раз и выскакивала последней с паузой.
  const mountedAt = useRef(0);
  const [wait, setWait] = useState<number | null>(null);
  useEffect(() => {
    mountedAt.current = performance.now();
  }, []);
  useEffect(() => {
    if (admin && wait === null) setWait(Math.max(0, delay - (performance.now() - mountedAt.current)));
  }, [admin, delay, wait]);

  // Новые обращения видно прямо с развилки — не заходя в админку.
  useEffect(() => {
    if (!admin) return;
    let alive = true;
    void unreadSupport().then((n) => alive && setUnread(n));
    return () => {
      alive = false;
    };
  }, [admin]);

  if (!admin || wait === null) return null;
  return (
    // Раздвигает место плавно, а не толкает список вниз рывком.
    <div className="animate-expand">
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
      delay={wait}
    />
    </div>
  );
}
