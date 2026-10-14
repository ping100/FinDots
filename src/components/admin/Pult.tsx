"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/lib/icons";
import { SUPABASE_FREE, VIEWS, countView, plural, type AdminOverview, type ViewId } from "@/lib/admin";
import { JOB_NAMES, agoText, isStale, type CronStatus } from "@/lib/adminJobs";
import type { HealthCheck } from "@/app/api/admin/health/route";
import type { ErrorGroup } from "./Tools";

/**
 * «Пульт» — главная админки: что требует внимания прямо сейчас (с кнопкой
 * действия у каждого дела), главные цифры и разделы со счётчиками.
 */

export interface AttentionItem {
  key: string;
  icon: string;
  color: string;
  title: string;
  caption: string;
  /** Коротко — для сводки в плашке сверху. */
  short: string;
  action: string;
  href: string;
  /** В какой раздел относится — для счётчиков на плитках. */
  area: "care" | "tech";
}

const PALE: Record<string, [string, string]> = {
  "#0ea5e9": ["#e0f2fe", "#0369a1"],
  "#ef4444": ["#fee2e2", "#b91c1c"],
  "#f59e0b": ["#fef3c7", "#b45309"],
  "#8b5cf6": ["#ede9fe", "#6d28d9"],
};

/** Собирает дела из всех источников. Каждый грузится сам — пульт оживает по частям. */
export function useAttention(data: AdminOverview | null) {
  const [support, setSupport] = useState<{ count: number; name: string; body: string; at: string } | null>(null);
  const [errors, setErrors] = useState<ErrorGroup[] | null>(null);
  const [cron, setCron] = useState<CronStatus | null>(null);
  const [health, setHealth] = useState<HealthCheck[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    const done = () => setLoaded((n) => n + 1);
    void supabase
      .from("support_messages")
      .select("user_id, body, created_at", { count: "exact" })
      .eq("from_admin", false)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data: rows, count }) => {
        const row = rows?.[0] as { user_id: string; body: string | null; created_at: string } | undefined;
        setSupport(row ? { count: count ?? 1, name: row.user_id, body: row.body ?? "📎 фото", at: row.created_at } : { count: 0, name: "", body: "", at: "" });
        done();
      });
    void supabase.rpc("admin_errors").then(({ data: rows }) => {
      setErrors((rows as ErrorGroup[] | null) ?? []);
      done();
    });
    void supabase.rpc("admin_cron_status").then(({ data: st }) => {
      setCron(st as CronStatus);
      done();
    });
    void supabase.rpc("app_notice").then(({ data: text }) => {
      setNotice(typeof text === "string" && text.trim() ? text : null);
      done();
    });
    // Проверка сервисов — самая долгая (ходит во внешние API): не держим пульт.
    void fetch("/api/admin/health", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((out: { checks?: HealthCheck[] } | null) => setHealth(out?.checks ?? []))
      .catch(() => setHealth([]))
      .finally(done);
  }, []);

  const items: AttentionItem[] = [];
  const nameOf = (id: string) => {
    const u = data?.users.find((x) => x.id === id);
    return u?.display_name || u?.email || "без имени";
  };

  if (support?.count) {
    items.push({
      key: "support",
      icon: "chat",
      color: "#0ea5e9",
      title: support.count > 1 ? `Обращений ждут ответа: ${support.count}` : `Обращение: ${nameOf(support.name)}`,
      caption: `«${support.body.slice(0, 80)}» · ${agoText(support.at)}`,
      short: `${support.count} ${plural(support.count, "обращение ждёт", "обращения ждут", "обращений ждут")} ответа`,
      action: "Ответить",
      href: "/admin/support",
      area: "care",
    });
  }
  const freshErrors = (errors ?? []).filter((e) => Date.now() - new Date(e.last_at).getTime() < 7 * 86400000);
  if (freshErrors.length) {
    const top = freshErrors[0];
    items.push({
      key: "errors",
      icon: "bolt",
      color: "#ef4444",
      title: `${freshErrors.length} ${plural(freshErrors.length, "новая ошибка", "новые ошибки", "новых ошибок")}`,
      caption: `у ${top.people} ${plural(top.people, "человека", "человек", "человек")} · ${top.message}`,
      short: `${freshErrors.length} ${plural(freshErrors.length, "новая ошибка", "новые ошибки", "новых ошибок")}`,
      action: "Смотреть",
      href: "/admin/errors",
      area: "tech",
    });
  }
  for (const job of cron?.jobs ?? []) {
    const stale = isStale(job);
    if (!stale && job.fails_24h === 0) continue;
    const name = JOB_NAMES[job.name] ?? job.name;
    items.push({
      key: `job-${job.name}`,
      icon: "repeat",
      color: "#f59e0b",
      title: stale ? "Задача встала" : "Задача со сбоями",
      caption: stale ? `${name} · последний запуск ${agoText(job.last_start)}` : `${name} · сбоев за сутки: ${job.fails_24h}`,
      short: `задача «${name}» ${stale ? "встала" : "сбоит"}`,
      action: "Открыть",
      href: "/admin/jobs",
      area: "tech",
    });
  }
  for (const c of health ?? []) {
    if (c.key === "jobs" || c.state === "ok") continue;
    items.push({
      key: `health-${c.key}`,
      icon: "shield",
      color: c.state === "bad" ? "#ef4444" : "#f59e0b",
      title: `${c.name}: ${c.state === "bad" ? "не работает" : "есть замечание"}`,
      caption: c.detail,
      short: `${c.name.toLowerCase()} ${c.state === "bad" ? "не работает" : "с замечанием"}`,
      action: "Проверить",
      href: "/admin/health",
      area: "tech",
    });
  }
  if (data && data.database.size_bytes / SUPABASE_FREE.databaseBytes >= 0.8) {
    const p = Math.round((data.database.size_bytes / SUPABASE_FREE.databaseBytes) * 100);
    items.push({
      key: "db",
      icon: "box",
      color: "#ef4444",
      title: `База заполнена на ${p}%`,
      caption: "Бесплатный лимит — 500 МБ. Пора чистить или переходить на платный тариф",
      short: `база заполнена на ${p}%`,
      action: "Подробнее",
      href: "/admin/tech",
      area: "tech",
    });
  }
  if (notice) {
    items.push({
      key: "notice",
      icon: "hammer",
      color: "#8b5cf6",
      title: "Включены технические работы",
      caption: notice.slice(0, 90),
      short: "включены технические работы",
      action: "Выключить",
      href: "/admin/notice",
      area: "care",
    });
  }

  return { items, loading: loaded < 5 };
}

/** Плашка сверху: «Требует внимания: 3» — или «Всё в порядке». */
export function StatusBanner({ items, loading }: { items: AttentionItem[]; loading: boolean }) {
  const calm = items.length === 0;
  return (
    <div
      className="rounded-[1.375rem] px-4 py-3.5 text-white"
      style={{
        background: loading && calm
          ? "linear-gradient(135deg, #94a3b8, #64748b)"
          : calm
            ? "linear-gradient(135deg, #10b981, #06b6d4)"
            : "linear-gradient(135deg, #f97316, #ef4444)",
        boxShadow: calm ? "0 14px 30px -18px rgba(16,185,129,.9)" : "0 14px 30px -16px rgba(239,68,68,.9)",
      }}
    >
      <p className="text-[1.125rem] font-extrabold leading-tight">
        {loading && calm ? "Проверяю…" : calm ? "Всё в порядке" : `Требует внимания: ${items.length}`}
      </p>
      <p className="mt-0.5 text-[0.8125rem] leading-snug opacity-95">
        {loading && calm
          ? "Обращения, ошибки, фоновые задачи, сервисы"
          : calm
            ? "Обращений нет · ошибок нет · задачи и сервисы работают"
            : items.map((i) => i.short).join(" · ")}
      </p>
    </div>
  );
}

/** Дело — карточка с кнопкой действия. */
export function AttentionCard({ item }: { item: AttentionItem }) {
  const [bg, fg] = PALE[item.color] ?? ["var(--surface-2)", "var(--text)"];
  return (
    <Link
      href={item.href}
      className="money-card mb-2 flex touch-manipulation items-center gap-3 rounded-[1.125rem] p-3 transition active:scale-[0.99] [&_*]:pointer-events-none"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: item.color }}>
        <Icon name={item.icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.875rem] font-bold leading-snug">{item.title}</span>
        <span className="line-clamp-2 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
          {item.caption}
        </span>
      </span>
      <span
        className="admin-pill shrink-0 rounded-full px-3 py-1.5 text-[0.75rem] font-bold"
        style={{ ["--pill-bg" as string]: bg, ["--pill-fg" as string]: fg }}
      >
        {item.action}
      </span>
    </Link>
  );
}

/** Главные цифры — по четыре в ряд, каждая ведёт в свой список. */
export function Kpis({ data }: { data: AdminOverview }) {
  const tiles: { id: ViewId; label: string; color?: string }[] = [
    { id: "all", label: "всего" },
    { id: "online", label: "онлайн", color: "#16a34a" },
    { id: "new_7d", label: "за неделю", color: "#16a34a" },
    { id: "active_30d", label: "за месяц" },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {tiles.map((t) => {
        const n = countView(data, t.id);
        return (
          <Link
            key={t.id}
            href={`/admin/${t.id}`}
            className="money-card touch-manipulation rounded-2xl px-2.5 py-2.5 transition active:scale-[0.97] [&_*]:pointer-events-none"
          >
            <span className="block text-[1.25rem] font-extrabold tabular-nums" style={{ color: t.color && n ? t.color : undefined }}>
              {t.id === "new_7d" && n ? `+${n}` : n}
            </span>
            <span className="block text-[0.625rem] leading-tight" style={{ color: "var(--muted)" }}>
              {t.id === "online" ? "онлайн" : t.id === "all" ? "всего" : t.id === "new_7d" ? "новых за неделю" : "активных за месяц"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** Разделы — плитки два в ряд, с красным счётчиком дел. */
export function SectionTiles({ data, items }: { data: AdminOverview; items: AttentionItem[] }) {
  const care = items.filter((i) => i.area === "care").length;
  const tech = items.filter((i) => i.area === "tech").length;
  const tiles = [
    { href: "/admin/all", icon: "users", color: "#3b82f6", title: "Пользователи", caption: `${data.totals.users} · поиск, доступ`, badge: 0 },
    { href: "/admin/care", icon: "chat", color: "#0ea5e9", title: "Поддержка", caption: "обращения, отзывы", badge: care },
    { href: "/admin/tech", icon: "wrench", color: "#64748b", title: "Техника", caption: "ошибки, задачи, сервисы", badge: tech },
    { href: "/admin/growth", icon: "trend", color: "#7c3aed", title: "Рост", caption: "удержание, функции", badge: 0 },
    { href: "/admin/ai", icon: "bolt", color: "#6366f1", title: "Нейросеть", caption: "ключ и модель", badge: 0 },
    { href: "/admin/log", icon: "list", color: "#94a3b8", title: "Журнал", caption: "действия админов", badge: 0 },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {tiles.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className="money-card relative touch-manipulation rounded-[1.125rem] p-3 transition active:scale-[0.98] [&_*]:pointer-events-none"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-[0.625rem] text-white" style={{ background: t.color }}>
            <Icon name={t.icon} size={17} />
          </span>
          {t.badge ? (
            <span
              className="absolute right-2.5 top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-extrabold text-white"
              style={{ background: "#ef4444" }}
            >
              {t.badge}
            </span>
          ) : null}
          <span className="mt-2 block text-[0.875rem] font-bold">{t.title}</span>
          <span className="block truncate text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            {t.caption}
          </span>
        </Link>
      ))}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-5 px-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--muted)" }}>
      {children}
    </p>
  );
}

/** Ссылка на список людей по приложениям — компактной строкой. */
export function UsageLine({ data }: { data: AdminOverview }) {
  const views: [ViewId, string][] = [
    ["money", "Findots"],
    ["tasks", "Todots"],
    ["fem", "FemDots"],
    ["wellness", "вода и сон"],
    ["push", "с уведомлениями"],
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {views.map(([id, label]) => (
        <Link
          key={id}
          href={`/admin/${id}`}
          className="rounded-full px-2.5 py-1 text-[0.6875rem] font-medium"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          title={VIEWS[id].title}
        >
          {label} <b className="tabular-nums">{countView(data, id)}</b>
        </Link>
      ))}
    </div>
  );
}
