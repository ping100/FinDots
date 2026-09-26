"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { REVIEW_MAX, deleteOwnReview, loadOwnReview, submitReview, type Review } from "@/lib/reviews";
import { Button, Sheet } from "./ui";
import { SettingsHeading } from "./SettingsHeading";

const STAR_COLOR = "#f59e0b";

function Stars({ rating, size = 32 }: { rating: number; size?: number }) {
  return (
    <span className="flex justify-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={size} style={{ color: n <= rating ? STAR_COLOR : "var(--border)" }} />
      ))}
    </span>
  );
}

/**
 * «Оценить приложение» в настройках: оценка 1–5 и необязательный текст.
 * Уходит прямо администратору — он видит его в админке, в «Отзывах».
 *
 * Один отзыв на человека (unique по user_id в базе), и строка рендерится
 * в обоих приложениях — если отзыв уже оставлен (хоть из money, хоть из
 * tasks), здесь сразу видно, что он есть, а не пустая форма заново.
 *
 * Админу строка не показывается: отзыв о приложении сам себе не пишут.
 */
export function ReviewRow({ heading }: { heading?: string }) {
  const admin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState<Review | null | undefined>(undefined);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (admin !== false) return;
    let alive = true;
    void loadOwnReview().then((review) => {
      if (alive) setExisting(review);
    });
    return () => {
      alive = false;
    };
  }, [admin]);

  if (admin !== false) return null;

  const close = () => {
    setOpen(false);
    setRating(0);
    setBody("");
    setProblem(null);
    setConfirmDelete(false);
  };

  const submit = async () => {
    if (busy || rating === 0) return;
    setBusy(true);
    setProblem(null);
    const error = await submitReview(rating, body);
    setBusy(false);
    if (error) setProblem(error);
    else setExisting(await loadOwnReview());
  };

  const removeOwn = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const error = await deleteOwnReview();
    setBusy(false);
    if (error) setProblem(error);
    else {
      setExisting(null);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      {heading ? <SettingsHeading>{heading}</SettingsHeading> : null}
      <div className="mb-4 overflow-hidden rounded-2xl" style={{ background: "var(--surface)" }}>
        <button onClick={() => setOpen(true)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
          <span className="flex-1">
            <span className="block text-[0.9375rem]">Оценить приложение</span>
            <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
              {existing ? `Вы поставили ${existing.rating} из 5` : "Оценка и пара слов — сразу администратору"}
            </span>
          </span>
          <Icon name="chevron-right" size={16} className="opacity-30" />
        </button>

        <Sheet open={open} title="Оценить приложение" onClose={close}>
          {existing && confirmDelete ? (
            <div className="space-y-3 pb-2">
              <p className="text-sm leading-snug">Отзыв удалится насовсем. Отменить нельзя.</p>
              {problem ? (
                <p className="text-sm" style={{ color: "var(--danger)" }}>
                  {problem}
                </p>
              ) : null}
              <Button variant="danger" onClick={() => void removeOwn()} disabled={busy}>
                {busy ? "Удаляю…" : "Удалить отзыв"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
                Отмена
              </Button>
            </div>
          ) : existing ? (
            <div className="space-y-3 py-2 text-center">
              <Stars rating={existing.rating} />
              {existing.body ? (
                <p className="whitespace-pre-wrap break-words text-left text-sm" style={{ color: "var(--muted)" }}>
                  {existing.body}
                </p>
              ) : null}
              <p className="text-sm">Спасибо, вы уже оценили приложение.</p>
              <Button variant="ghost" onClick={close}>
                Закрыть
              </Button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="block w-full text-center text-[0.8125rem]"
                style={{ color: "var(--danger)" }}
              >
                Удалить отзыв
              </button>
            </div>
          ) : (
            <div className="space-y-4 pb-2">
              <div className="flex justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-label={`${n} из 5`}
                    aria-pressed={rating >= n}
                    className="p-1 transition active:scale-90"
                  >
                    <Icon name="star" size={32} style={{ color: rating >= n ? STAR_COLOR : "var(--border)" }} />
                  </button>
                ))}
              </div>

              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, REVIEW_MAX))}
                placeholder="Что понравилось, что поправить (необязательно)"
                rows={4}
                className="w-full resize-none rounded-2xl border px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-[var(--accent)]"
                style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
              />

              {problem ? (
                <p className="text-sm" style={{ color: "var(--danger)" }}>
                  {problem}
                </p>
              ) : null}

              <Button onClick={() => void submit()} disabled={busy || rating === 0}>
                {busy ? "Отправляю…" : "Отправить"}
              </Button>
            </div>
          )}
        </Sheet>
      </div>
    </>
  );
}
