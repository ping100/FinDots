"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { Loader } from "@/components/Loader";
import { Avatar } from "@/components/Avatar";
import { Denied, useOverview } from "@/components/admin/shared";
import { messageTime } from "@/lib/support";
import { loadReviews, type Review } from "@/lib/reviews";
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

/**
 * Отзывы: оценка и текст, которые люди оставляют из настроек. Список, а не
 * переписка — отвечать здесь некуда, это не обращение.
 */
export default function ReviewsPage() {
  const { data, denied } = useOverview();
  const [reviews, setReviews] = useState<Review[] | null>(null);

  useEffect(() => {
    void loadReviews().then(setReviews);
  }, []);

  if (denied) return <Denied />;
  if (reviews === null) return <Loader />;

  const who = (userId: string): AdminUser | undefined => data?.users.find((u) => u.id === userId);
  const name = (user: AdminUser | undefined) => user?.display_name || user?.email || "Пользователь";
  const average =
    reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

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

      {average !== null ? (
        <div className="mb-3 flex items-center gap-3 rounded-2xl p-3.5" style={{ background: "var(--surface)" }}>
          <Stars rating={Math.round(average)} />
          <span className="text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            {average.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} из 5 · {reviews.length}{" "}
            {plural(reviews.length)}
          </span>
        </div>
      ) : null}

      {reviews.length === 0 ? (
        <p className="rounded-2xl p-4 text-[0.8125rem] leading-snug" style={{ background: "var(--surface)", color: "var(--muted)" }}>
          Отзывов пока нет. Люди оставляют их из настроек.
        </p>
      ) : (
        <div className="space-y-2">
          {reviews.map((review) => {
            const user = who(review.user_id);
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
                  <span className="shrink-0 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                    {messageTime(review.created_at)}
                  </span>
                </div>
                <div className="mt-1.5">
                  <Stars rating={review.rating} />
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
