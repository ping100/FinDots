"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { latestUnreadReply } from "@/lib/support";

/** Что уже показали на этом устройстве — не всплывает заново тем же ответом. */
const DISMISSED_KEY = "dots.dismissedReplyId";

/**
 * «Администратор ответил» — такая же полоса внизу, как про обновление, и
 * по той же причине: переписка лежит в настройках, а туда просто так не
 * заходят. Проверяем один раз при открытии — чаще незачем, за скорость
 * отвечает пуш.
 */
export function AdminReplyBanner() {
  const router = useRouter();
  const [reply, setReply] = useState<{ id: number; body: string; count: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const supabase = createClient();
      // На входе, на развилке и в самой админке переписки ни у кого нет
      // смысла спрашивать: либо ещё не вошли, либо это и есть админ.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { data: admin } = await supabase.rpc("is_admin");
      if (admin) return;

      const row = await latestUnreadReply();
      if (!alive || !row) return;
      const dismissed = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
      if (row.id > dismissed) setReply(row);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!reply) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(reply.id));
    } catch {
      // Приватный режим — полоса вернётся при следующем входе, не страшно.
    }
    setReply(null);
  };

  return (
    <div
      className="animate-rise flex items-center gap-3 rounded-2xl px-4 py-3"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--accent)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      }}
    >
      <span className="min-w-0 flex-1 text-sm leading-snug">
        {reply.count > 1 ? `Администратор ответил (${reply.count})` : "Администратор ответил"}
        <span className="mt-0.5 block truncate text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          {reply.body}
        </span>
      </span>
      <button
        onClick={() => {
          dismiss();
          router.push("/money/settings");
        }}
        className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold text-white transition-transform duration-100 active:scale-95"
        style={{ background: "var(--accent)" }}
      >
        Посмотреть
      </button>
      <button onClick={dismiss} aria-label="Позже" className="shrink-0 rounded-full p-1 opacity-50">
        <span className="text-lg leading-none">×</span>
      </button>
    </div>
  );
}
