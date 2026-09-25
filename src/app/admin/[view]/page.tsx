"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Icon } from "@/lib/icons";
import { Loader } from "@/components/Loader";
import { Denied, GeneratedAt, Problem, RefreshButton, UserCard, useOverview } from "@/components/admin/shared";
import { VIEWS, countView, isView, type ViewId } from "@/lib/admin";

/**
 * Один список пользователей: все, онлайн, новые, активные, по приложениям.
 *
 * Переключатель сверху — чтобы пролистать списки подряд, не возвращаясь
 * каждый раз на главную админки. Переключение заменяет адрес, а не
 * добавляет: «назад» ведёт в админку, а не по всем открытым спискам.
 */
export default function AdminViewPage() {
  const params = useParams<{ view: string }>();
  const view: ViewId = isView(params.view) ? params.view : "all";
  const { data, denied, problem, busy, reload } = useOverview();

  if (denied) return <Denied />;
  if (!data && !problem) return <Loader />;

  const now = data ? new Date(data.generated_at).getTime() : 0;
  // Сверху — кто был недавно: их и хочется видеть первыми.
  const users = (data?.users ?? [])
    .filter((u) => VIEWS[view].test(u, now))
    .sort((a, b) => (b.last_seen ?? "").localeCompare(a.last_seen ?? ""));

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <header className="flex items-center gap-2 py-3">
        <Link
          href="/admin"
          aria-label="В админку"
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full"
          style={{ color: "var(--muted)" }}
        >
          <Icon name="chevron-left" size={20} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[1.375rem] font-semibold">
          {VIEWS[view].title}
          {data ? (
            <span className="ml-2 font-normal tabular-nums" style={{ color: "var(--muted)" }}>
              {users.length}
            </span>
          ) : null}
        </h1>
        <RefreshButton busy={busy} onClick={reload} />
      </header>

      <nav className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {(Object.keys(VIEWS) as ViewId[]).map((id) => {
          const on = id === view;
          return (
            <Link
              key={id}
              href={`/admin/${id}`}
              replace
              aria-current={on ? "page" : undefined}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium"
              style={
                on
                  ? { background: "var(--accent)", color: "#fff" }
                  : { background: "var(--surface)", border: "1px solid var(--border)" }
              }
            >
              {VIEWS[id].chip}
              {data ? <span className="tabular-nums opacity-70">{countView(data, id)}</span> : null}
            </Link>
          );
        })}
      </nav>

      {problem ? <Problem text={problem} /> : null}

      <p className="mb-2 px-1 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
        Только счётчики: суммы, названия операций и тексты задач здесь не видны —
        людям обещано, что их данные видят только они.
      </p>

      <div className="space-y-2">
        {users.map((user) => (
          <UserCard key={user.id} user={user} now={now} />
        ))}
        {data && users.length === 0 ? (
          <p className="rounded-2xl p-3.5 text-[0.8125rem]" style={{ background: "var(--surface)", color: "var(--muted)" }}>
            Таких пока нет.
          </p>
        ) : null}
      </div>

      {data ? <GeneratedAt iso={data.generated_at} /> : null}
    </div>
  );
}
