"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/lib/icons";
import { Loader } from "@/components/Loader";
import { Denied, GeneratedAt, Problem, RefreshButton, UserCard, useOverview } from "@/components/admin/shared";
import { UserActionsSheet } from "@/components/admin/UserActionsSheet";
import { VIEWS, countView, plural, type AdminUser, type ViewId } from "@/lib/admin";
import { toCsv } from "@/lib/csv";
import { sendMessage } from "@/lib/support";
import { createClient } from "@/lib/supabase/client";

/**
 * Один список пользователей: все, онлайн, новые, активные, по приложениям.
 *
 * Переключатель сверху — чтобы пролистать списки подряд, не возвращаясь
 * каждый раз на главную админки. Переключение — на месте, без перехода на
 * другую страницу: данные уже здесь, отфильтровать их — мгновенно. Адрес
 * при этом подменяется, а не добавляется: «назад» ведёт в админку, а не по
 * всем открытым спискам.
 */
export function ViewScreen({ initial }: { initial: ViewId }) {
  const [view, setView] = useState<ViewId>(initial);
  // Id, а не сам объект: после действия в листе данные обновляются
  // (reload), и лист должен показать уже новое состояние, а не снимок
  // на момент открытия.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { data, denied, problem, busy, reload } = useOverview();
  const selected = selectedId ? (data?.users.find((u) => u.id === selectedId) ?? null) : null;

  if (denied) return <Denied />;
  if (!data && !problem) return <Loader />;

  const now = data ? new Date(data.generated_at).getTime() : 0;
  // Сверху — кто был недавно: их и хочется видеть первыми.
  // Поиск — по имени, почте (и Google), номеру «ID 12» или просто «12».
  const q = query.trim().toLowerCase().replace(/^id\s*/, "");
  const matches = (u: AdminUser) =>
    !q ||
    [u.display_name, u.email, u.google_email].some((v) => v?.toLowerCase().includes(q)) ||
    String(u.number ?? "") === q;
  const users = (data?.users ?? [])
    .filter((u) => VIEWS[view].test(u, now))
    .filter((u) => matches(u))
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
            <button
              key={id}
              onClick={() => {
                setView(id);
                window.history.replaceState(null, "", `/admin/${id}`);
              }}
              aria-pressed={on}
              className="flex shrink-0 touch-manipulation items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium"
              style={
                on
                  ? { background: "var(--accent)", color: "#fff" }
                  : { background: "var(--surface)", border: "1px solid var(--border)" }
              }
            >
              {VIEWS[id].chip}
              {data ? <span className="tabular-nums opacity-70">{countView(data, id)}</span> : null}
            </button>
          );
        })}
      </nav>

      <label
        className="mb-3 flex items-center gap-2 rounded-2xl px-3 py-2.5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <Icon name="search" size={16} style={{ color: "var(--muted)" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Имя, почта или ID"
          className="min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none"
          inputMode="search"
        />
        {query ? (
          <button onClick={() => setQuery("")} aria-label="Очистить поиск" style={{ color: "var(--muted)" }}>
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </label>

      {problem ? <Problem text={problem} /> : null}

      <p className="mb-2 px-1 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
        Только счётчики: суммы, названия операций и тексты задач здесь не видны —
        людям обещано, что их данные видят только они.
      </p>

      {data && users.length ? (
        <button
          onClick={() => exportCsv(users, VIEWS[view].title)}
          className="mb-2 flex items-center gap-1.5 px-1 text-[0.8125rem] font-medium"
          style={{ color: "var(--accent)" }}
        >
          <Icon name="share" size={14} />
          Выгрузить {users.length} в таблицу
        </button>
      ) : null}

      {view === "empty" && users.length ? <EmptyActions users={users} onDone={reload} /> : null}

      <div className="space-y-2">
        {users.map((user) => (
          <UserCard key={user.id} user={user} now={now} onClick={() => setSelectedId(user.id)} />
        ))}
        {data && users.length === 0 ? (
          <p className="rounded-2xl p-3.5 text-[0.8125rem]" style={{ background: "var(--surface)", color: "var(--muted)" }}>
            Таких пока нет.
          </p>
        ) : null}
      </div>

      {data ? <GeneratedAt iso={data.generated_at} /> : null}

      <UserActionsSheet user={selected} onClose={() => setSelectedId(null)} onChanged={reload} />
    </div>
  );
}

/**
 * Выгрузка списка в таблицу (CSV, открывается в Excel и Google Таблицах):
 * только то, что и так видно в админке, — без сумм и записей.
 */
function exportCsv(users: AdminUser[], title: string) {
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU") : "");
  const rows = [
    ["ID", "Имя", "Почта", "Google", "Регистрация", "Последний раз", "Findots: операций", "Todots: задач", "FemDots", "Вода и сон", "Уведомления", "Заблокирован"],
    ...users.map((u) => [
      u.number,
      u.display_name,
      u.email,
      u.google_email,
      day(u.created_at),
      day(u.last_seen),
      u.transactions,
      u.tasks_open + u.tasks_done,
      u.fem ? "да" : "нет",
      u.wellness ? "да" : "нет",
      u.push_devices ? "да" : "нет",
      u.banned ? "да" : "нет",
    ]),
  ];
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `dots-${title.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const HINT =
  "Здравствуйте! Вы зарегистрировались в Dots, но пока не начали. Подсказка: в Findots нажмите на доход и введите сумму — " +
  "а потом перетащите его в кошелёк. В Todots — «+» внизу, и первая задача готова. Если что-то непонятно — ответьте на это сообщение 🙂";

/** Пустые аккаунты: напомнить всем с подсказкой или удалить (спам-регистрации). */
function EmptyActions({ users, onDone }: { users: AdminUser[]; onDone: () => void }) {
  const [stage, setStage] = useState<"idle" | "delete">("idle");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const n = users.length;
  const people = `${n} ${plural(n, "человеку", "людям", "людям")}`;

  const hint = async () => {
    setBusy(true);
    let ok = 0;
    for (const u of users) if (!(await sendMessage(HINT, u.id))) ok += 1;
    await createClient()
      .rpc("admin_log_add", { p_action: "Подсказка пустым аккаунтам", p_target: null, p_details: `отправлено ${ok} из ${n}` })
      .then(() => undefined, () => undefined);
    setBusy(false);
    setNote(`Подсказка отправлена ${ok} из ${n} — придёт сообщением от администрации`);
  };

  const remove = async () => {
    setBusy(true);
    const supabase = createClient();
    let ok = 0;
    for (const u of users) {
      await supabase.rpc("admin_log_add", { p_action: "Удалён пустой аккаунт", p_target: u.id, p_details: null }).then(() => undefined, () => undefined);
      const { error } = await supabase.rpc("admin_delete_user", { p_user_id: u.id });
      if (!error) ok += 1;
    }
    setBusy(false);
    setStage("idle");
    setPhrase("");
    setNote(`Удалено ${ok} из ${n}`);
    onDone();
  };

  return (
    <div className="mb-3 rounded-2xl p-3.5" style={{ background: "var(--surface)" }}>
      <p className="text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
        Больше месяца с нами и ни одной записи. Можно помочь начать — или убрать спам-регистрации.
      </p>
      {stage === "idle" ? (
        <div className="mt-2.5 flex gap-2">
          <button
            onClick={() => void hint()}
            disabled={busy}
            className="flex-1 rounded-xl py-2 text-[0.8125rem] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {busy ? "Отправляю…" : `Подсказку ${people}`}
          </button>
          <button
            onClick={() => setStage("delete")}
            className="rounded-xl px-3 py-2 text-[0.8125rem] font-semibold"
            style={{ background: "var(--surface-2)", color: "var(--danger)" }}
          >
            Удалить всех
          </button>
        </div>
      ) : (
        <div className="mt-2.5 space-y-2">
          <p className="text-[0.8125rem]" style={{ color: "var(--danger)" }}>
            Удалятся {n} {plural(n, "аккаунт", "аккаунта", "аккаунтов")} насовсем. Наберите УДАЛИТЬ:
          </p>
          <input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-[0.9375rem] outline-none"
            style={{ background: "var(--surface-2)" }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => void remove()}
              disabled={busy || phrase.trim().toUpperCase() !== "УДАЛИТЬ"}
              className="flex-1 rounded-xl py-2 text-[0.8125rem] font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--danger)" }}
            >
              {busy ? "Удаляю…" : "Удалить насовсем"}
            </button>
            <button onClick={() => setStage("idle")} className="rounded-xl px-3 py-2 text-[0.8125rem] font-semibold" style={{ background: "var(--surface-2)" }}>
              Отмена
            </button>
          </div>
        </div>
      )}
      {note ? (
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--ok)" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
