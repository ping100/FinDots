"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { Loader } from "@/components/Loader";
import { buildMoment } from "@/lib/update";
import { SupportCard } from "@/components/admin/SupportCard";
import { Denied, GeneratedAt, OnlineDot, Problem, RefreshButton, useOverview } from "@/components/admin/shared";
import {
  LINKS,
  SUPABASE_FREE,
  VIEWS,
  countView,
  formatBytes,
  plural,
  pressure,
  type AdminOverview,
  type ViewId,
} from "@/lib/admin";

/**
 * Админка Dots: главные числа и лимиты. Люди — на отдельных экранах за
 * плитками: список на главной рос бы с каждым пользователем и хоронил
 * под собой лимиты.
 */
export default function AdminPage() {
  const { data, denied, problem, busy, reload } = useOverview();
  const [built, setBuilt] = useState<string | null>(null);

  useEffect(() => setBuilt(buildMoment()), []);

  if (denied) return <Denied />;
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
        <RefreshButton busy={busy} onClick={reload} />
      </header>

      {problem ? <Problem text={problem} /> : null}

      {data ? (
        <>
          <Heading first>Пользователи</Heading>
          <Totals data={data} />
          <Heading>Обращения</Heading>
          <SupportCard />
          <SupabaseLimits data={data} />
          <VercelBlock built={built} />
          <GeneratedAt iso={data.generated_at} />
        </>
      ) : null}
    </div>
  );
}

function Heading({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return <h2 className={`mb-2 px-1 text-[0.9375rem] font-semibold ${first ? "mt-1" : "mt-6"}`}>{children}</h2>;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface)" }}>
      {children}
    </div>
  );
}

/** Главные числа — крупно, по два в ряд. Каждая плитка ведёт к своему списку. */
function Totals({ data }: { data: AdminOverview }) {
  const t = data.totals;
  const tiles: ViewId[] = ["all", "online", "new_7d", "active_30d"];
  const inline = (id: ViewId) => (
    <Link
      href={`/admin/${id}`}
      className="font-medium underline decoration-dotted underline-offset-2"
      style={{ color: "var(--text)" }}
    >
      {countView(data, id)}
    </Link>
  );
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((id) => (
          // Нажатие ловит сама плитка: подписи и значки внутри касание
          // пропускают насквозь. Иначе iPhone засчитывал нажатие только
          // по стрелке, а по числу и подписи — нет.
          <Link
            key={id}
            href={`/admin/${id}`}
            className="block cursor-pointer touch-manipulation rounded-2xl p-3.5 transition active:scale-[0.98] [&_*]:pointer-events-none"
            style={{ background: "var(--surface)" }}
          >
            <span
              className="flex items-center justify-between gap-2 text-[0.6875rem] leading-snug"
              style={{ color: "var(--muted)" }}
            >
              <span className="flex items-center gap-1.5">
                {id === "online" ? <OnlineDot /> : null}
                {VIEWS[id].label}
              </span>
              <Icon name="chevron-right" size={12} className="shrink-0 opacity-50" />
            </span>
            <span className="mt-1 block text-[1.625rem] font-semibold tabular-nums">{countView(data, id)}</span>
          </Link>
        ))}
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
