"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { Button, Field, inputClass, inputStyle } from "@/components/ui";
import { Icon } from "@/lib/icons";

/**
 * Куда попадает человек по ссылке из письма о сбросе пароля (её присылает
 * администратор из админки). Ссылка уже открыла временную сессию —
 * здесь только вписывают новый пароль.
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      const short = error.message.match(/at least (\d+) characters/i);
      setProblem(short ? `Пароль короче ${short[1]} символов` : error.message);
      return;
    }
    router.replace("/");
  };

  return (
    <div className="auth-glow mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-8">
      <div className="mb-6 mt-auto flex flex-col items-center text-center">
        <Logo size={76} />
        <h1 className="mt-4 text-[1.75rem] font-semibold tracking-tight">Новый пароль</h1>
        <p className="mt-1.5 text-sm leading-snug" style={{ color: "var(--muted)" }}>
          Придумайте пароль и войдите с ним в следующий раз
        </p>
      </div>

      <form
        onSubmit={submit}
        className="rounded-3xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <Field label="Новый пароль" hint="Минимум 6 символов">
          <div className="relative">
            <input
              type={shown ? "text" : "password"}
              required
              minLength={6}
              autoComplete="new-password"
              className={`${inputClass} pr-12`}
              style={inputStyle}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShown((v) => !v)}
              aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-2xl opacity-55 transition active:scale-90 active:opacity-100"
            >
              <Icon name={shown ? "eye-off" : "eye"} size={20} />
            </button>
          </div>
        </Field>

        {problem ? (
          <p className="mb-3 text-sm" style={{ color: "var(--danger)" }}>
            {problem}
          </p>
        ) : null}

        <Button type="submit" disabled={busy}>
          {busy ? "Сохраняю…" : "Сохранить пароль"}
        </Button>
      </form>
    </div>
  );
}
