"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { disablePush } from "@/lib/pushClient";
import { Button, Sheet, inputClass, inputStyle } from "./ui";

/** Слово, которое нужно вписать, чтобы разрешить удаление. */
const PHRASE = "УДАЛИТЬ";

/**
 * Удалить свою учётную запись насовсем — с подтверждением фразой, как
 * «Начать с чистого листа». В отличие от него стирает не только данные
 * одного приложения, а вообще всё: обе программы, вход, отзыв, переписку.
 *
 * Действует на оба приложения сразу — учётная запись одна на Findots и
 * Todots, поэтому и кнопка здесь одна, а не по своей в каждом.
 */
export function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setPhrase("");
    setProblem(null);
  };

  const submit = async () => {
    if (phrase.trim().toUpperCase() !== PHRASE || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("delete_own_account");
      if (error) throw new Error(error.message);
      await disablePush().catch(() => undefined);
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Не получилось");
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left [&:not(:first-child)]:border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="flex-1">
          <span className="block text-[0.9375rem]" style={{ color: "var(--danger)" }}>
            Удалить аккаунт
          </span>
          <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
            Учётная запись и все данные исчезнут без возможности восстановить
          </span>
        </span>
      </button>

      <Sheet open={open} title="Удалить аккаунт" onClose={close}>
        <div className="space-y-3 pb-2">
          <p className="text-sm leading-snug">
            Удалится насовсем: учётная запись, вход, кошельки, накопления, долги, категории,
            операции, задачи и их категории — в Findots и в Todots сразу. Обратно не вернуть.
          </p>
          <p className="text-sm leading-snug" style={{ color: "var(--muted)" }}>
            Если нужна история — сначала выгрузите операции в CSV, в настройках денег, в
            «Данных».
          </p>

          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--muted)" }}>
              Наберите «{PHRASE}», чтобы разрешить удаление
            </label>
            <input
              className={inputClass}
              style={inputStyle}
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={PHRASE}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
            />
          </div>

          {problem ? (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {problem}
            </p>
          ) : null}

          <Button
            variant="danger"
            onClick={() => void submit()}
            disabled={busy || phrase.trim().toUpperCase() !== PHRASE}
          >
            {busy ? "Удаляю…" : "Удалить аккаунт насовсем"}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
