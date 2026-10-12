"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { Loader } from "@/components/Loader";
import { Avatar } from "@/components/Avatar";
import { Denied, useOverview } from "@/components/admin/shared";
import { Button, Sheet } from "@/components/ui";
import { messageTime } from "@/lib/support";
import { REVIEW_APPS, deleteReview, loadReviews, type Review, type ReviewApp } from "@/lib/reviews";
import type { AdminUser } from "@/lib/admin";

const STAR_COLOR = "#f59e0b";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={15} style={{ color: n <= rating ? STAR_COLOR : "var(--border)" }} />
      ))}
    </span>
  );
}

/** Фильтр списка: все отзывы, одно приложение или старые — до разделения. */
type Filter = "all" | ReviewApp | "old";

/**
 * Отзывы: оценка и текст, которые люди оставляют из настроек. Список, а не
 * переписка — отвечать здесь некуда, это не обращение. Сверху — средняя
 * оценка каждого приложения, нажатие на неё оставляет только его отзывы.
 */
export default function ReviewsPage() {
  const { data, denied } = useOverview();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [toDelete, setToDelete] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    void loadReviews().then(setReviews);
  }, []);

  const confirmDelete = async () => {
    if (!toDelete || busy) return;
    setBusy(true);
    const error = await deleteReview(toDelete.id);
    setBusy(false);
    if (!error) {
      setReviews((prev) => prev?.filter((r) => r.id !== toDelete.id) ?? null);
      setToDelete(null);
    }
  };

  if (denied) return <Denied />;
  if (reviews === null) return <Loader />;

  const who = (userId: string): AdminUser | undefined => data?.users.find((u) => u.id === userId);
  const name = (user: AdminUser | undefined) => user?.display_name || user?.email || "Пользователь";
  const averageOf = (list: Review[]) =>
    list.length > 0 ? list.reduce((sum, r) => sum + r.rating, 0) / list.length : null;
  const old = reviews.filter((r) => r.app === null);
  const shown =
    filter === "all" ? reviews : filter === "old" ? old : reviews.filter((r) => r.app === filter);
  const average = averageOf(shown);
  const appOf = (review: Review) => REVIEW_APPS.find((a) => a.id === review.app);

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
        <h1 className="flex-1 text-[1.375rem] font-semibold">Отзывы</h1>
      </header>

      <div className="mb-3 grid grid-cols-3 gap-2">
        {REVIEW_APPS.map((app) => {
          const list = reviews.filter((r) => r.app === app.id);
          const avg = averageOf(list);
          const on = filter === app.id;
          return (
            <button
              key={app.id}
              onClick={() => setFilter(on ? "all" : app.id)}
              aria-pressed={on}
              className="rounded-2xl border p-3 text-left transition active:scale-[0.98]"
              style={{ background: "var(--surface)", borderColor: on ? app.color : "transparent" }}
            >
              <span className="flex items-center gap-1.5 text-[0.75rem] font-medium">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-md text-white"
                  style={{ background: app.color }}
                >
                  <Icon name={app.icon} size={12} />
                </span>
                {app.label}
              </span>
              <span className="mt-1.5 flex items-center gap-1 text-[1.125rem] font-semibold tabular-nums">
                {avg !== null ? avg.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) : "—"}
                {avg !== null ? <Icon name="star" size={14} style={{ color: STAR_COLOR }} /> : null}
              </span>
              <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                {list.length} {plural(list.length)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["all", "Все"],
            ...REVIEW_APPS.map((a) => [a.id, a.label]),
            ...(old.length > 0 ? [["old", "До разделения"]] : []),
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className="rounded-full px-3 py-1.5 text-[0.8125rem] transition active:scale-95"
            style={{
              background: filter === id ? "var(--accent)" : "var(--surface)",
              color: filter === id ? "#fff" : "var(--text)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {average !== null ? (
        <div className="mb-3 flex items-center gap-3 rounded-2xl p-3.5" style={{ background: "var(--surface)" }}>
          <Stars rating={Math.round(average)} />
          <span className="text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            {average.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} из 5 · {shown.length}{" "}
            {plural(shown.length)}
          </span>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="rounded-2xl p-4 text-[0.8125rem] leading-snug" style={{ background: "var(--surface)", color: "var(--muted)" }}>
          {reviews.length === 0
            ? "Отзывов пока нет. Люди оставляют их из настроек."
            : "Об этом приложении отзывов пока нет."}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((review) => {
            const user = who(review.user_id);
            const app = appOf(review);
            return (
              <div key={review.id} className="rounded-2xl p-3.5" style={{ background: "var(--surface)" }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 truncate text-[0.875rem] font-medium">
                    <Avatar url={user?.avatar_url} name={name(user)} size={24} />
                    {user?.number != null ? (
                      <span className="font-normal tabular-nums" style={{ color: "var(--muted)" }}>
                        ID {user.number}
                      </span>
                    ) : null}
                    {name(user)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                      {messageTime(review.created_at)}
                    </span>
                    <button
                      onClick={() => setToDelete(review)}
                      aria-label="Удалить отзыв"
                      className="-m-1 p-1 opacity-40 transition active:scale-90 active:opacity-100"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Stars rating={review.rating} />
                  {filter === "all" ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
                      style={
                        app
                          ? { background: `color-mix(in srgb, ${app.color} 16%, transparent)`, color: app.color }
                          : { background: "var(--surface-2)", color: "var(--muted)" }
                      }
                    >
                      {app ? app.label : "до разделения"}
                    </span>
                  ) : null}
                </div>
                {review.body ? (
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-[0.8125rem] leading-snug">
                    {review.body}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={toDelete !== null} title="Удалить отзыв" onClose={() => setToDelete(null)}>
        <div className="space-y-3 pb-2">
          <p className="text-sm leading-snug">Отзыв удалится насовсем. Отменить нельзя.</p>
          <Button variant="danger" onClick={() => void confirmDelete()} disabled={busy}>
            {busy ? "Удаляю…" : "Удалить"}
          </Button>
          <Button variant="ghost" onClick={() => setToDelete(null)} disabled={busy}>
            Отмена
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function plural(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "отзыв";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "отзыва";
  return "отзывов";
}
