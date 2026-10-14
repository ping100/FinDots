"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";
import { computeAllowance } from "@/lib/allowance";
import { convert, formatMoney } from "@/lib/money";
import { setMoneyHidden, useMoneyHidden } from "@/lib/privacy";
import { plural } from "@/lib/admin";
import { today } from "@/lib/tasks/dates";
import { cycleInfo, signalsFrom, type FemDay, type FemPeriod, type FemSettings } from "@/lib/fem/cycle";
import type { Category, CurrencyCode, ExchangeRate, Transaction, Wallet } from "@/lib/types";
import type { Task } from "@/lib/tasks/types";
import type { OrbitApp } from "./Orbit";

/**
 * Сводка под орбитой: по строке на приложение — то главное, ради чего его
 * открывают. Включается в шестерёнке, по умолчанию выключена: данные
 * грузятся, только когда строка включена.
 */
export function HomeSummary({ apps, delay }: { apps: OrbitApp[]; delay: number }) {
  return (
    <div className="space-y-2">
      {apps.map((app, i) => (
        <div key={app.id} className="animate-lift" style={{ animationDelay: `${delay + i * 90}ms` }}>
          {app.id === "money" ? <MoneyRow app={app} /> : app.id === "tasks" ? <TasksRow app={app} /> : <FemRow app={app} />}
        </div>
      ))}
    </div>
  );
}

type Line = { label: string; value: string; detail?: string; tone?: "danger" };

function Row({ app, line, extra }: { app: OrbitApp; line: Line | null | undefined; extra?: React.ReactNode }) {
  return (
    <Link
      href={app.href}
      className="glass flex min-h-[4.25rem] items-center gap-3 rounded-[1.25rem] px-4 py-3 transition active:scale-[0.98]"
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: app.color, boxShadow: `0 0 10px ${app.color}` }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        {line === undefined ? (
          <>
            <span className="block h-3 w-28 animate-pulse rounded-full" style={{ background: "var(--glass-line)" }} />
            <span className="mt-2 block h-4 w-20 animate-pulse rounded-full" style={{ background: "var(--glass-line)" }} />
          </>
        ) : line === null ? (
          <>
            <span className="block text-[0.75rem]" style={{ color: "var(--ink-2)" }}>
              {app.name}
            </span>
            <span className="block text-[0.875rem] font-medium">Не удалось загрузить — откройте приложение</span>
          </>
        ) : (
          <>
            <span className="block text-[0.75rem]" style={{ color: "var(--ink-2)" }}>
              {line.label}
            </span>
            <span
              className="animate-fade block truncate text-[1.125rem] font-bold leading-snug tabular-nums"
              style={{ color: line.tone === "danger" ? "#ef4444" : undefined }}
            >
              {line.value}
            </span>
            {line.detail ? (
              <span className="line-clamp-2 block text-[0.75rem] leading-snug" style={{ color: "var(--ink-2)" }}>
                {line.detail}
              </span>
            ) : null}
          </>
        )}
      </span>
      {extra}
      <span style={{ color: "var(--ink-2)" }}>
        <Icon name="chevron-right" size={16} />
      </span>
    </Link>
  );
}

/** undefined — грузится, null — не вышло. */
function useLoad<T>(load: () => Promise<T>): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    load()
      .then((v) => alive && setValue(v))
      .catch(() => alive && setValue(null));
    return () => {
      alive = false;
    };
    // Грузим один раз при появлении строки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

// ───────────────────────────── деньги ─────────────────────────────

async function loadMoney() {
  const db = createClient();
  const { data: session } = await db.auth.getSession();
  const id = session.session?.user.id;
  if (!id) throw new Error("нет входа");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const [p, r, w, c, b, tx] = await Promise.all([
    db.from("profiles").select("base_currency").eq("id", id).maybeSingle(),
    db.from("exchange_rates").select("code, rate_to_base, updated_at"),
    db.from("wallets").select("*"),
    db.from("categories").select("*"),
    db.from("wallet_balances").select("wallet_id, currency, balance"),
    // Расчёту нужен только этот месяц.
    db.from("transactions").select("*").gte("occurred_at", monthStart).limit(3000),
  ]);
  const failed = [p, r, w, c, b, tx].find((x) => x.error);
  if (failed) throw failed.error;
  const base = ((p.data as { base_currency?: string } | null)?.base_currency ?? "KZT") as CurrencyCode;
  const rates = (r.data ?? []) as ExchangeRate[];
  const wallets = (w.data ?? []) as Wallet[];
  const balances = (b.data ?? []) as { wallet_id: string; balance: number | string }[];
  if (!wallets.some((x) => !x.archived)) return { base, empty: true as const };
  const data = computeAllowance({
    wallets,
    categories: (c.data ?? []) as Category[],
    transactions: (tx.data ?? []) as Transaction[],
    balanceOf: (walletId) => Number(balances.find((x) => x.wallet_id === walletId)?.balance ?? 0),
    toBase: (amount, currency) => convert(amount, currency, base, rates),
  });
  return { base, empty: false as const, data };
}

function MoneyRow({ app }: { app: OrbitApp }) {
  const money = useLoad(loadMoney);
  const hidden = useMoneyHidden();
  let line: Line | null | undefined = money === undefined ? undefined : null;
  if (money?.empty) line = { label: "Findots", value: "Добавьте первый кошелёк" };
  else if (money) {
    const { data, base } = money;
    line = data.short
      ? {
          label: "Не хватает на обязательные платежи",
          value: formatMoney(data.obligations - data.money, base),
          tone: "danger",
        }
      : {
          label: "Можно тратить сегодня",
          value: formatMoney(data.perDay, base),
          detail: data.spentToday > 0 ? `Сегодня потрачено ${formatMoney(data.spentToday, base)}` : "Сегодня трат ещё не было",
        };
  }
  return (
    <Row
      app={app}
      line={line}
      extra={
        money && !money.empty ? (
          <button
            onClick={(e) => {
              // Глазок внутри ссылки: не уводим в приложение.
              e.preventDefault();
              e.stopPropagation();
              setMoneyHidden(!hidden);
            }}
            aria-label={hidden ? "Показать суммы" : "Скрыть суммы"}
            className="-my-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-90"
            style={{ color: "var(--ink-2)" }}
          >
            <Icon name={hidden ? "eye-off" : "eye"} size={18} />
          </button>
        ) : null
      }
    />
  );
}

// ───────────────────────────── задачи ─────────────────────────────

async function loadTasks() {
  const db = createClient();
  const day = today();
  const res = await db
    .from("tasks")
    .select("id, title, date, time, done, carry_over")
    .or(`date.eq.${day},and(date.lt.${day},done.eq.false,carry_over.eq.true)`)
    .limit(500);
  if (res.error) throw res.error;
  return { day, list: (res.data ?? []) as Pick<Task, "id" | "title" | "date" | "time" | "done" | "carry_over">[] };
}

function TasksRow({ app }: { app: OrbitApp }) {
  const tasks = useLoad(loadTasks);
  let line: Line | null | undefined = tasks === undefined ? undefined : null;
  if (tasks) {
    const left = tasks.list.filter((t) => !t.done);
    const done = tasks.list.length - left.length;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const timed = left.filter((t) => t.time).sort((a, b) => a.time!.localeCompare(b.time!));
    const next = timed.find((t) => t.time!.slice(0, 5) >= hhmm) ?? left.find((t) => !t.time) ?? timed[0];
    line =
      tasks.list.length === 0
        ? { label: "Задачи на сегодня", value: "Свободный день", detail: "Ничего не запланировано" }
        : left.length === 0
          ? { label: "Задачи на сегодня", value: "Всё сделано", detail: `${done} ${plural(done, "задача", "задачи", "задач")} — отличный день` }
          : {
              label: "Задачи на сегодня",
              value: `Осталось ${left.length} ${plural(left.length, "задача", "задачи", "задач")}`,
              detail: next ? `Дальше: ${next.time ? `${next.time.slice(0, 5)} · ` : ""}${next.title}` : undefined,
            };
  }
  return <Row app={app} line={line} />;
}

// ───────────────────────────── цикл ─────────────────────────────

async function loadFem() {
  const db = createClient();
  const { data: session } = await db.auth.getSession();
  const id = session.session?.user.id;
  if (!id) throw new Error("нет входа");
  const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const [s, p, d] = await Promise.all([
    db.from("fem_settings").select("*").eq("user_id", id).maybeSingle(),
    db.from("fem_periods").select("id, start_date, end_date").order("start_date"),
    // Для прогноза хватает последних месяцев: тесты, температура, экстренная.
    db.from("fem_days").select("day, lh, temp, meds, tags").gte("day", since).order("day").limit(500),
  ]);
  const failed = [s, p, d].find((x) => x.error);
  if (failed) throw failed.error;
  const settings = s.data as FemSettings | null;
  if (!settings) return "none" as const;
  const days = new Map(((d.data ?? []) as FemDay[]).map((x) => [x.day, x]));
  return cycleInfo((p.data ?? []) as FemPeriod[], settings, today(), signalsFrom(days, settings));
}

function FemRow({ app }: { app: OrbitApp }) {
  const info = useLoad(loadFem);
  let line: Line | null | undefined = info === undefined ? undefined : null;
  if (info === "none") line = { label: "FemDots", value: "Отметьте первые месячные" };
  else if (info) {
    const days = (n: number) => `${n} ${plural(n, "день", "дня", "дней")}`;
    if (info.pregnancy)
      line = {
        label: "Беременность",
        value: `${info.pregnancy.weeks} нед. ${info.pregnancy.days ? `${info.pregnancy.days} дн.` : ""}`.trim(),
      };
    else if (info.cycleDay == null) line = { label: "Цикл", value: "Отметьте первые месячные" };
    else if (info.current)
      line = { label: "Цикл", value: `Месячные, ${info.cycleDay}-й день`, detail: `${info.cycleDay}-й день цикла` };
    else if (info.late > 0)
      line = { label: "Цикл", value: `${info.cycleDay}-й день цикла`, detail: `Задержка ${days(info.late)}` };
    else
      line = {
        label: "Цикл",
        value: `${info.cycleDay}-й день цикла`,
        detail:
          info.daysToNext == null
            ? undefined
            : info.daysToNext === 0
              ? "Месячные ожидаются сегодня"
              : `До месячных ~${days(info.daysToNext)}`,
      };
  }
  return <Row app={app} line={line} />;
}
