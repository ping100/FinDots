"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";

interface Summary {
  count: number;
  average: number | null;
}

async function loadSummary(): Promise<Summary> {
  const { data } = await createClient().from("reviews").select("rating");
  const ratings = (data ?? []).map((r) => r.rating as number);
  if (ratings.length === 0) return { count: 0, average: null };
  return { count: ratings.length, average: ratings.reduce((a, b) => a + b, 0) / ratings.length };
}

/** Вход в отзывы на главной админки — со средней оценкой. */
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
              : `${summary.average!.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} из 5 · ${summary.count}`}
        </span>
      </span>
      <Icon name="chevron-right" size={16} className="opacity-30" />
    </Link>
  );
}
