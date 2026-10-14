"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/lib/icons";
import { plural } from "@/lib/admin";
import { RefreshButton } from "./shared";

/**
 * Инструменты админки: журнал ошибок, рассылка, журнал действий и график
 * активности. Данные — функциями базы, которые пускают только админа.
 */

export interface ErrorGroup {
  fingerprint: string;
  app: string | null;
  message: string;
  stack: string | null;
  path: string | null;
  build: string | null;
  ua: string | null;
  times: number;
  people: number;
  first_at: string;
  last_at: string;
}

export interface LogEntry {
  id: number;
  created_at: string;
  action: string;
  target_label: string | null;
  details: string | null;
  admin_label: string | null;
}

export interface Announcement {
  id: number;
  created_at: string;
  title: string;
  body: string;
  url: string | null;
}

/** Загрузка через функцию базы: отказ (нет прав) отдельно от сбоя связи. */
export function useAdminRpc<T>(name: string) {
  const [data, setData] = useState<T | null>(null);
  const [denied, setDenied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    const { data: rows, error } = await createClient().rpc(name);
    setBusy(false);
    if (error) {
      if (error.code === "42501") setDenied(true);
      else setProblem(error.message);
      return;
    }
    setData(rows as T);
  }, [name]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, denied, problem, busy, reload: () => void load() };
}

export function AdminHeader({ title, back = "/admin", busy, onRefresh }: { title: string; back?: string; busy?: boolean; onRefresh?: () => void }) {
  return (
    <header className="flex items-center gap-2 py-3">
      <Link
        href={back}
        aria-label="Назад"
        className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full"
        style={{ color: "var(--muted)" }}
      >
        <Icon name="chevron-left" size={20} />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-[1.375rem] font-semibold">{title}</h1>
      {onRefresh ? <RefreshButton busy={!!busy} onClick={onRefresh} /> : null}
    </header>
  );
}

/** Строка-вход на главной админки: значок, название, подпись, счётчик. */
export function LinkCard({
  href,
  icon,
  color,
  title,
  caption,
  badge,
  badgeColor = "var(--accent)",
}: {
  href: string;
  icon: string;
  color: string;
  title: string;
  caption: string;
  badge?: number;
  badgeColor?: string;
}) {
  return (
    <Link
      href={href}
      className="mb-2 flex touch-manipulation items-center gap-3 rounded-2xl p-3.5 transition active:scale-[0.99] [&_*]:pointer-events-none"
      style={{ background: "var(--surface)" }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: color }}>
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium">{title}</span>
        <span className="block truncate text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          {caption}
        </span>
      </span>
      {badge ? (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[0.75rem] font-semibold tabular-nums text-white"
          style={{ background: badgeColor }}
        >
          {badge}
        </span>
      ) : null}
      <Icon name="chevron-right" size={16} className="opacity-30" />
    </Link>
  );
}

/** Входы в технические инструменты — для главной админки, с коротким статусом. */
export function ToolCards() {
  const [errors, setErrors] = useState<ErrorGroup[] | null>(null);
  const [jobs, setJobs] = useState<{ bad: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const supabase = createClient();
    void supabase.rpc("admin_errors").then(({ data }) => setErrors((data as ErrorGroup[] | null) ?? []));
    void supabase.rpc("admin_cron_status").then(({ data }) => {
      const list = ((data as { jobs?: { fails_24h: number; active: boolean }[] } | null)?.jobs ?? []);
      setJobs({ bad: list.filter((j) => j.fails_24h > 0 || !j.active).length, total: list.length });
    });
    void supabase.rpc("app_notice").then(({ data }) => setNotice((data as string | null) ?? null));
  }, []);
  const fresh = errors?.filter((e) => Date.now() - new Date(e.last_at).getTime() < 86400000).length ?? 0;
  return (
    <>
      <LinkCard
        href="/admin/errors"
        icon="bolt"
        color="#ef4444"
        title="Ошибки"
        caption={
          errors === null
            ? "…"
            : errors.length === 0
              ? "Сбоев нет"
              : `${errors.length} ${plural(errors.length, "ошибка", "ошибки", "ошибок")}${fresh ? ` · ${fresh} за сутки` : ""}`
        }
        badge={errors?.length || undefined}
        badgeColor="#ef4444"
      />
      <LinkCard
        href="/admin/jobs"
        icon="repeat"
        color="#0ea5e9"
        title="Фоновые задачи"
        caption={jobs === null ? "…" : jobs.bad ? `Проблемы: ${jobs.bad} из ${jobs.total}` : `Все ${jobs.total} работают`}
        badge={jobs?.bad || undefined}
        badgeColor="#ef4444"
      />
      <LinkCard href="/admin/health" icon="shield" color="#22c55e" title="Проверка сервисов" caption="База, курс, нейросеть, пуши — одной кнопкой" />
      <LinkCard
        href="/admin/notice"
        icon="hammer"
        color="#f59e0b"
        title="Технические работы"
        caption={notice === undefined ? "…" : notice ? "Включено — полосу видят все" : "Выключено"}
        badge={notice ? 1 : undefined}
        badgeColor="#f59e0b"
      />
      <LinkCard href="/admin/broadcast" icon="share" color="#8b5cf6" title="Рассылка" caption="Объявление всем — полосой и пушем" />
      <LinkCard href="/admin/log" icon="list" color="#64748b" title="Журнал действий" caption="Кто из админов что сделал" />
    </>
  );
}

/** Входы в аналитику роста. */
export function GrowthCards() {
  return (
    <>
      <LinkCard href="/admin/growth" icon="chart" color="#7c3aed" title="Рост" caption="Путь новичка и удержание по неделям" />
      <LinkCard href="/admin/features" icon="star" color="#ec4899" title="Функции" caption="Чем реально пользуются, а что не нужно" />
    </>
  );
}

/**
 * «Уведомления мне»: пуш админу о новом обращении, новой ошибке, низкой
 * оценке, сбоях фоновых задач, полной базе и сводка в 9 утра.
 */
export function AlertsCard() {
  const [on, setOn] = useState<boolean | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    void createClient()
      .rpc("admin_my_alerts")
      .then(({ data }) => setOn(data !== false));
  }, []);
  const toggle = async () => {
    const next = !on;
    setOn(next);
    await createClient().rpc("admin_set_alerts", { p_on: next });
  };
  const test = async () => {
    setNote("Отправляю…");
    const { data } = await createClient().auth.getUser();
    const res = await fetch("/api/admin/push-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: data.user?.id }),
    });
    const out = (await res.json().catch(() => ({}))) as { sent?: number; error?: string };
    setNote(res.ok ? (out.sent ? "Отправил — должно прийти через пару секунд" : "Не дошло — разрешите уведомления на этом телефоне") : out.error ?? "Не получилось");
  };
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface)" }}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: "#0ea5e9" }}>
          <Icon name="bell" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium">Уведомления мне</span>
          <span className="block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
            Обращения, новые ошибки, оценки 1–2★, сбои задач, полная база и сводка в 9:00
          </span>
        </span>
        <button
          onClick={() => void toggle()}
          role="switch"
          aria-checked={!!on}
          disabled={on === null}
          className="relative h-7 w-12 shrink-0 rounded-full transition"
          style={{ background: on ? "var(--ok)" : "var(--surface-2)" }}
        >
          <span
            className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all"
            style={{ left: on ? "calc(100% - 1.625rem)" : "0.125rem" }}
          />
        </button>
      </div>
      <button onClick={() => void test()} className="mt-2.5 text-[0.8125rem] font-medium" style={{ color: "var(--accent)" }}>
        Проверить на этом телефоне
      </button>
      {note ? (
        <p className="mt-1 text-[0.75rem]" style={{ color: "var(--muted)" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Активность за 30 дней: сколько людей заходило каждый день и сколько
 * зарегистрировалось. Два маленьких графика друг под другом — у них разный
 * масштаб, на одной оси новички потерялись бы.
 */
export function ActivityCard() {
  const { data } = useAdminRpc<{ day: string; active: number; signups: number }[]>("admin_activity");
  const [pick, setPick] = useState<number | null>(null);
  if (!data?.length) return null;
  const last = data[data.length - 1];
  const week = data.slice(-7);
  const avgWeek = week.reduce((s, d) => s + d.active, 0) / week.length;
  const signups30 = data.reduce((s, d) => s + d.signups, 0);
  const shown = pick != null ? data[pick] : null;
  const label = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[0.9375rem] font-semibold">Активность</p>
        <p className="text-[0.6875rem] tabular-nums" style={{ color: "var(--muted)" }}>
          {shown ? label(shown.day) : "за 30 дней"}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Figure value={shown ? shown.active : last.active} label={shown ? "заходили" : "сегодня заходили"} />
        <Figure value={shown ? shown.signups : Math.round(avgWeek)} label={shown ? "новых" : "в среднем за неделю"} />
        <Figure value={signups30} label="новых за месяц" />
      </div>
      <Bars values={data.map((d) => d.active)} color="#0ea5e9" pick={pick} onPick={setPick} height={56} />
      <p className="mt-1 text-[0.625rem]" style={{ color: "var(--muted)" }}>
        Сколько людей открывало приложения
      </p>
      <Bars values={data.map((d) => d.signups)} color="#22c55e" pick={pick} onPick={setPick} height={28} />
      <p className="mt-1 text-[0.625rem]" style={{ color: "var(--muted)" }}>
        Регистрации · нажмите на столбик — покажу день
      </p>
    </div>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl px-1 py-1.5" style={{ background: "var(--surface-2)" }}>
      <p className="text-[1.125rem] font-bold tabular-nums">{value}</p>
      <p className="text-[0.625rem] leading-tight" style={{ color: "var(--muted)" }}>
        {label}
      </p>
    </div>
  );
}

function Bars({
  values,
  color,
  height,
  pick,
  onPick,
}: {
  values: number[];
  color: string;
  height: number;
  pick: number | null;
  onPick: (i: number | null) => void;
}) {
  const top = Math.max(1, ...values);
  return (
    <div className="mt-3 flex items-end gap-[2px]" style={{ height }}>
      {values.map((v, i) => (
        <button
          key={i}
          onClick={() => onPick(pick === i ? null : i)}
          aria-label={`${v}`}
          className="flex h-full flex-1 items-end"
        >
          <span
            className="block w-full rounded-t-[3px]"
            style={{
              height: v ? Math.max(3, (v / top) * height) : 2,
              background: v ? color : "var(--border)",
              opacity: pick == null || pick === i ? 1 : 0.35,
            }}
          />
        </button>
      ))}
    </div>
  );
}
