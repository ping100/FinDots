"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { REVIEW_MAX, submitReview } from "@/lib/reviews";
import { Button, Sheet } from "./ui";
import { SettingsHeading } from "./SettingsHeading";

const STAR_COLOR = "#f59e0b";

/**
 * «Оставить отзыв» в настройках: оценка 1–5 и необязательный текст.
 * Уходит прямо администратору — он видит его в админке, в «Отзывах».
 *
 * Админу строка не показывается: отзыв о приложении сам себе не пишут.
 */
export function ReviewRow({ heading }: { heading?: string }) {
  const admin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (admin !== false) return null;

  const close = () => {
    setOpen(false);
    setRating(0);
    setBody("");
    setProblem(null);
    setSent(false);
  };

  const submit = async () => {
    if (busy || rating === 0) return;
    setBusy(true);
    setProblem(null);
    const error = await submitReview(rating, body);
    setBusy(false);
    if (error) setProblem(error);
    else setSent(true);
  };

  return (
    <>
      {heading ? <SettingsHeading>{heading}</SettingsHeading> : null}
      <div className="mb-4 overflow-hidden rounded-2xl" style={{ background: "var(--surface)" }}>
        <button onClick={() => setOpen(true)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
          <span className="flex-1">
            <span className="block text-[0.9375rem]">Оставить отзыв</span>
            <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
              Оценка и пара слов — сразу администратору
            </span>
          </span>
          <Icon name="chevron-right" size={16} className="opacity-30" />
        </button>

        <Sheet open={open} title="Оставить отзыв" onClose={close}>
          {sent ? (
            <div className="space-y-3 py-4 text-center">
              <div className="flex justify-center">
                <Icon name="star" size={32} style={{ color: STAR_COLOR }} />
              </div>
              <p className="text-sm">Спасибо! Отзыв отправлен.</p>
              <Button variant="ghost" onClick={close}>
                Закрыть
              </Button>
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
