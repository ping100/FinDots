"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/lib/icons";
import { Loader } from "@/components/Loader";
import { buildMoment } from "@/lib/update";
import {
  LINKS,
  SUPABASE_FREE,
  formatBytes,
  plural,
  pressure,
  sinceLabel,
  type AdminOverview,
  type AdminUser,
} from "@/lib/admin";

/**
 * Админка Dots.
 *
 * Пускает сама база: страница просто спрашивает сводку, а функция в базе
 * отвечает отказом всем, кого нет в таблице admins. Поэтому здесь нет
 * своей проверки — она была бы лишь видимостью защиты.
 */
export default function AdminPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [denied, setDenied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [built, setBuilt] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const usersRef = useRef<HTMLDivElement>(null);

  // Нажали на плитку — показываем этих людей: список ниже экрана, и без
  // прокрутки нажатие выглядело бы так, будто ничего не произошло.
  const pick = (id: FilterId) => {
    setFilter((current) => (current === id ? "all" : id));
    requestAnimationFrame(() => usersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const load = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    const { data: overview, error } = await createClient().rpc("admin_overview");
    setBusy(false);
    if (error) {
      // 42501 — «нет прав»: это ответ базы, а не сбой, и показывать его
      // надо иначе, чем обрыв связи.
      if (error.code === "42501") setDenied(true);
      else setProblem(error.message);
      return;
    }
    setData(overview as AdminOverview);
  }, []);

  useEffect(() => {
    void load();
    setBuilt(buildMoment());
  }, [load]);

  if (denied) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-semibold">Сюда нельзя</p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Эта страница только для администратора.
        </p>
        <Link href="/" className="mt-2 text-sm" style={{ color: "var(--accent)" }}>
          На главную
        </Link>
      </div>
    );
  }

  if (!data && !problem) return <Loader />;

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <header className="flex items-center gap-2 py-3">
        <Link
          href="/"
          aria-label="На главную"
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full"
          style={{ color: "var(--muted)" }}
        >
          <Icon name="chevron-left" size={20} />
        </Link>
        <h1 className="flex-1 text-[1.625rem] font-semibold">Админка</h1>
        <button
          onClick={() => void load()}
          disabled={busy}
          className="rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium disabled:opacity-50"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          {busy ? "Обновляю…" : "Обновить"}
        </button>
      </header>

      {problem ? (
        <p className="mb-4 rounded-2xl px-4 py-3 text-sm" style={{ background: "var(--surface)", color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}

      {data ? (
        <>
          <Totals data={data} filter={filter} onPick={pick} />
          <SupabaseLimits data={data} />
          <VercelBlock built={built} />
          <div ref={usersRef} className="scroll-mt-4">
            <Users users={data.users} filter={filter} onReset={() => setFilter("all")} />
          </div>
          <p className="mt-6 text-center text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            Данные на {new Date(data.generated_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
          </p>
        </>
      ) : null}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-6 px-1 text-[0.9375rem] font-semibold">{children}</h2>;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface)" }}>
      {children}
    </div>
  );
}

/**
 * Кого показать в списке. Плитки считают тем же правилом, что и фильтр:
 * иначе на плитке «4», а в списке трое — и непонятно, кто из них врёт.
 */
const FILTERS = {
  all: { label: "Всего пользователей", title: "Все", test: () => true },
  new_7d: { label: "Новых за неделю", title: "Новые за неделю", test: (u: AdminUser) => within(u.created_at, 7) },
  active_7d: { label: "Активных за неделю", title: "Активные за неделю", test: (u: AdminUser) => within(u.last_seen, 7) },
  active_30d: { label: "Активных за месяц", title: "Активные за месяц", test: (u: AdminUser) => within(u.last_seen, 30) },
  money: { label: "Деньгами пользуются", title: "Пользуются деньгами", test: (u: AdminUser) => u.transactions > 0 },
  tasks: { label: "Задачами пользуются", title: "Пользуются задачами", test: (u: AdminUser) => u.tasks_open + u.tasks_done > 0 },
} satisfies Record<string, { label: string; title: string; test: (u: AdminUser) => boolean }>;

type FilterId = keyof typeof FILTERS;

function within(iso: string | null, days: number): boolean {
  return iso !== null && Date.now() - new Date(iso).getTime() < days * 86_400_000;
}

/** Главные числа — крупно, по два в ряд: на телефоне больше не влезает. */
function Totals({
  data,
  filter,
  onPick,
}: {
  data: AdminOverview;
  filter: FilterId;
  onPick: (id: FilterId) => void;
}) {
  const t = data.totals;
  const count = (id: FilterId) => data.users.filter(FILTERS[id].test).length;
  const tiles: FilterId[] = ["all", "new_7d", "active_7d", "active_30d"];
  const inline = (id: FilterId) => (
    <button
      onClick={() => onPick(id)}
      aria-pressed={filter === id}
      className="font-medium underline decoration-dotted underline-offset-2"
      style={{ color: filter === id ? "var(--accent)" : "var(--text)" }}
    >
      {count(id)}
    </button>
  );
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((id) => {
          const on = filter === id && id !== "all";
          return (
            <button
              key={id}
              onClick={() => onPick(id)}
              aria-pressed={on}
              className="rounded-2xl p-3.5 text-left transition active:scale-[0.98]"
              style={{
                background: "var(--surface)",
                boxShadow: on ? "inset 0 0 0 2px var(--accent)" : undefined,
              }}
            >
              <span className="flex items-center justify-between gap-2 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
                {FILTERS[id].label}
                <Icon name="chevron-right" size={12} className="shrink-0 opacity-50" />
              </span>
              <span className="mt-1 block text-[1.625rem] font-semibold tabular-nums">{count(id)}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 px-1 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
        Деньгами пользуются {inline("money")} · задачами {inline("tasks")}. Всего{" "}
        {t.transactions} {plural(t.transactions, "операция", "операции", "операций")} и {t.tasks}{" "}
        {plural(t.tasks, "задача", "задачи", "задач")}.
      </p>
    </>
  );
}

function Meter({
  label,
  used,
  limit,
  show,
}: {
  label: string;
  used: number;
  limit: number;
  show: (n: number) => string;
}) {
  const share = limit > 0 ? used / limit : 0;
  const { color, word } = pressure(share);
  const percent = share * 100;
  return (
    <div className="[&:not(:first-child)]:mt-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[0.8125rem]">
        <span>{label}</span>
        <span className="tabular-nums" style={{ color: "var(--muted)" }}>
          {show(used)} из {show(limit)}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full"
        style={{ background: "var(--surface-2)" }}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        {/* Хотя бы тонкая черта: при долях процента полоса иначе пустая, и
            не понять, считается ли что-то вообще. */}
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(percent, 1.5))}%`, background: color }}
        />
      </div>
      <p className="mt-1 text-[0.6875rem]" style={{ color: word ? color : "var(--muted)" }}>
        {percent < 0.1 ? "меньше 0,1%" : `${percent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`}
        {word ? ` — ${word}` : ""}
      </p>
    </div>
  );
}

function SupabaseLimits({ data }: { data: AdminOverview }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Heading>Supabase — бесплатный тариф</Heading>
      <Card>
        <Meter label="База данных" used={data.database.size_bytes} limit={SUPABASE_FREE.databaseBytes} show={formatBytes} />
        <Meter label="Файлы" used={data.storage.size_bytes} limit={SUPABASE_FREE.storageBytes} show={formatBytes} />
        <Meter
          label="Активных за месяц"
          used={data.totals.active_30d}
          limit={SUPABASE_FREE.monthlyActiveUsers}
          show={(n) => n.toLocaleString("ru-RU")}
        />

        <p className="mt-4 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
          Трафик (лимит 5 ГБ в месяц) из базы не посчитать — его Supabase показывает
          только у себя в панели.
        </p>
        <a
          href={LINKS.supabaseUsage}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[0.8125rem] font-medium"
          style={{ color: "var(--accent)" }}
        >
          Расход в Supabase →
        </a>

        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-4 flex w-full items-center gap-1 text-[0.8125rem]"
          style={{ color: "var(--muted)" }}
          aria-expanded={open}
        >
          Что занимает место
          <Icon name={open ? "chevron-down" : "chevron-right"} size={14} />
        </button>
        {open ? (
          <div className="mt-2 space-y-1">
            {data.database.tables.map((table) => (
              <div key={table.name} className="flex justify-between gap-3 text-[0.75rem]">
                <span className="truncate">{table.name}</span>
                <span className="shrink-0 tabular-nums" style={{ color: "var(--muted)" }}>
                  {table.rows} {plural(table.rows, "строка", "строки", "строк")} · {formatBytes(table.bytes)}
                </span>
              </div>
            ))}
            <p className="pt-1 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
              Остальное место в базе — служебные таблицы Supabase: вход, журналы,
              расширения. Они есть в любом проекте и растут медленно.
            </p>
          </div>
        ) : null}
      </Card>
    </>
  );
}

/**
 * Vercel отдельного API с расходом лимитов не даёт, а ключ, которым его
 * можно было бы достать, открывает весь аккаунт: удалить проект, прочитать
 * секреты. Класть такой в приложение ради таблички — не та цена, поэтому
 * здесь ссылка.
 */
function VercelBlock({ built }: { built: string | null }) {
  return (
    <>
      <Heading>Vercel</Heading>
      <Card>
        <p className="text-[0.8125rem] leading-snug">
          Запросы, время процессора и трафик Vercel показывает только у себя.
        </p>
        <a
          href={LINKS.vercelUsage}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[0.8125rem] font-medium"
          style={{ color: "var(--accent)" }}
        >
          Расход в Vercel →
        </a>
        {built ? (
          <p className="mt-3 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            Эта версия приложения собрана {built}
          </p>
        ) : null}
      </Card>
    </>
  );
}

const PROVIDERS: Record<string, string> = { email: "почту", google: "Google" };

function Users({
  users,
  filter,
  onReset,
}: {
  users: AdminUser[];
  filter: FilterId;
  onReset: () => void;
}) {
  // Сверху — кто был недавно: их и хочется видеть первыми.
  const sorted = users
    .filter(FILTERS[filter].test)
    .sort((a, b) => (b.last_seen ?? "").localeCompare(a.last_seen ?? ""));
  return (
    <>
      <div className="mb-2 mt-6 flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-[0.9375rem] font-semibold">
          {filter === "all" ? "Пользователи" : FILTERS[filter].title}
          <span className="ml-1.5 font-normal tabular-nums" style={{ color: "var(--muted)" }}>
            {sorted.length}
          </span>
        </h2>
        {filter !== "all" ? (
          <button onClick={onReset} className="text-[0.8125rem] font-medium" style={{ color: "var(--accent)" }}>
            Показать всех
          </button>
        ) : null}
      </div>
      <p className="-mt-1 mb-2 px-1 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
        Только счётчики: суммы, названия операций и тексты задач здесь не видны —
        людям обещано, что их данные видят только они.
      </p>
      <div className="space-y-2">
        {sorted.map((user) => (
          <div key={user.id} className="rounded-2xl p-3.5" style={{ background: "var(--surface)" }}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-[0.9375rem] font-medium">
                {user.display_name || user.email || "без имени"}
              </p>
              <p className="shrink-0 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                был {sinceLabel(user.last_seen)}
              </p>
            </div>
            {user.display_name && user.email ? (
              <p className="truncate text-[0.75rem]" style={{ color: "var(--muted)" }}>
                {user.email}
              </p>
            ) : null}

            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.75rem]">
              <span>
                <span style={{ color: "var(--muted)" }}>Деньги: </span>
                {user.transactions} {plural(user.transactions, "операция", "операции", "операций")}
              </span>
              <span>
                <span style={{ color: "var(--muted)" }}>Задачи: </span>
                {user.tasks_open} в работе, {user.tasks_done} сделано
              </span>
              <span>
                <span style={{ color: "var(--muted)" }}>Кошельков: </span>
                {user.wallets}
              </span>
              <span>
                <span style={{ color: "var(--muted)" }}>ИИ-разбор: </span>
                {user.has_ai_key ? `${user.ai_calls} ${plural(user.ai_calls, "раз", "раза", "раз")}` : "нет ключа"}
              </span>
            </div>

            <p className="mt-2 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              появился {sinceLabel(user.created_at)} · входит через{" "}
              {user.providers.map((p) => PROVIDERS[p] ?? p).join(" и ") || "—"}
            </p>
          </div>
        ))}
        {sorted.length === 0 ? (
          <p className="rounded-2xl p-3.5 text-[0.8125rem]" style={{ background: "var(--surface)", color: "var(--muted)" }}>
            Таких пока нет.
          </p>
        ) : null}
      </div>
    </>
  );
}
