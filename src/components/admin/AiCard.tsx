"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { AI_MODELS } from "@/lib/aiModels";

interface Status {
  configured: boolean;
  model: string;
}

/** Вход в управление общим ключом ИИ-разбора на главной админки. */
export function AiCard() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    void fetch("/api/admin/ai-config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setStatus(data));
  }, []);

  const modelLabel = AI_MODELS.find((m) => m.id === status?.model)?.label ?? status?.model;

  return (
    <Link
      href="/admin/ai"
      className="mb-2 flex touch-manipulation items-center gap-3 rounded-2xl p-3.5 transition active:scale-[0.99] [&_*]:pointer-events-none"
      style={{ background: "var(--surface)" }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: "#6366f1" }}
      >
        <Icon name="bolt" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium">Нейросеть</span>
        <span className="block truncate text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          {status === null ? "…" : status.configured ? modelLabel : "Ключ не задан"}
        </span>
      </span>
      <Icon name="chevron-right" size={16} className="opacity-30" />
    </Link>
  );
}
