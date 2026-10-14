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

/** Входы в ошибки, рассылку и журнал действий — для главной админки. */
export function ToolCards() {
  const [errors, setErrors] = useState<ErrorGroup[] | null>(null);
  useEffect(() => {
    void createClient()
      .rpc("admin_errors")
      .then(({ data }) => setErrors((data as ErrorGroup[] | null) ?? []));
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
      <LinkCard href="/admin/broadcast" icon="share" color="#8b5cf6" title="Рассылка" caption="Объявление всем — полосой и пушем" />
      <LinkCard href="/admin/log" icon="list" color="#64748b" title="Журнал действий" caption="Кто из админов что сделал" />
    </>
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
