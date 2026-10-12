"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";
import { REVIEW_APPS } from "@/lib/reviews";

interface Summary {
  count: number;
  /** Средняя по каждому приложению, у которого есть отзывы. */
  apps: { label: string; average: number }[];
}

async function loadSummary(): Promise<Summary> {
  const { data } = await createClient().from("reviews").select("rating, app");
  const rows = (data ?? []) as { rating: number; app: string | null }[];
  const apps = REVIEW_APPS.flatMap((app) => {
    const ratings = rows.filter((r) => r.app === app.id).map((r) => r.rating);
    return ratings.length ? [{ label: app.label, average: ratings.reduce((a, b) => a + b, 0) / ratings.length }] : [];
  });
  return { count: rows.length, apps };
}

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

/** Вход в отзывы на главной админки — со средней оценкой каждого приложения. */
export function ReviewsCard() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    void loadSummary().then(setSummary);
  }, []);

  return (
    <Link
      href="/admin/reviews"
      className="mb-2 flex touch-manipulation items-center gap-3 rounded-2xl p-3.5 transition active:scale-[0.99] [&_*]:pointer-events-none"
      style={{ background: "var(--surface)" }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: "#f59e0b" }}
      >
        <Icon name="star" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium">Отзывы</span>
        <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          {summary === null
            ? "…"
            : summary.count === 0
              ? "Пока нет"
              : summary.apps.length
                ? `${summary.apps.map((a) => `${a.label} ${fmt(a.average)}`).join(" · ")} · всего ${summary.count}`
                : `Всего ${summary.count}`}
        </span>
      </span>
      <Icon name="chevron-right" size={16} className="opacity-30" />
    </Link>
  );
}
