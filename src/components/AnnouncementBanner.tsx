"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Какое объявление уже закрыли на этом устройстве. */
const DISMISSED_KEY = "dots.dismissedNewsId";
/** Старые новости новичкам не показываем: им они ни к чему. */
const FRESH_DAYS = 14;

/**
 * Объявление от администрации («Рассылка» в админке) — полоса внизу, как
 * про ответ поддержки. Показывается один раз: закрыли — больше не всплывёт.
 */
export function AnnouncementBanner() {
  const router = useRouter();
  const [news, setNews] = useState<{ id: number; title: string; body: string; url: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const since = new Date(Date.now() - FRESH_DAYS * 86400000).toISOString();
      const joined = session.user.created_at ?? since;
      const { data } = await supabase
        .from("announcements")
        .select("id, title, body, url, created_at")
        .gt("created_at", joined > since ? joined : since)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive || !data) return;
      let dismissed = 0;
      try {
        dismissed = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
      } catch {
        // Хранилище закрыто — покажем, ничего страшного.
      }
      if (data.id > dismissed) setNews(data);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!news) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(news.id));
    } catch {
      // Приватный режим — полоса вернётся при следующем входе.
    }
    setNews(null);
  };

  return (
    <div
      className="animate-rise rounded-2xl px-4 py-3"
      style={{ background: "var(--surface)", border: "1px solid var(--accent)", boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}
    >
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
        Новости Dots
      </p>
      <p className="mt-0.5 text-[0.9375rem] font-semibold leading-snug">{news.title}</p>
      <p className="mt-0.5 whitespace-pre-line text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
        {news.body}
      </p>
      <div className="mt-2.5 flex gap-2">
        {news.url ? (
          <button
            onClick={() => {
              dismiss();
              if (news.url!.startsWith("/")) router.push(news.url!);
              else window.open(news.url!, "_blank", "noopener");
            }}
            className="rounded-full px-4 py-2 text-sm font-semibold text-white transition-transform duration-100 active:scale-95"
            style={{ background: "var(--accent)" }}
          >
            Открыть
          </button>
        ) : null}
        <button
          onClick={dismiss}
          className="rounded-full px-4 py-2 text-sm font-semibold transition-transform duration-100 active:scale-95"
          style={{ background: "var(--surface-2)" }}
        >
          Понятно
        </button>
      </div>
    </div>
  );
}
