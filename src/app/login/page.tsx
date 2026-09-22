"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TURNSTILE_SITE_KEY, Turnstile } from "@/components/Turnstile";
import { Button, Field, inputClass, inputStyle } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0);

  // Без ключа капчи её просто нет, и вход ничем не отличается от прежнего.
  const captchaRequired = !!TURNSTILE_SITE_KEY;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setMessage(null);
    const supabase = createClient();

    const captcha = captchaToken ?? undefined;
    const result =
      mode === "in"
        ? await supabase.auth.signInWithPassword({
            email,
            password,
            options: { captchaToken: captcha },
          })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              captchaToken: captcha,
              emailRedirectTo: `${location.origin}/auth/callback`,
            },
          });

    setBusy(false);

    if (result.error) {
      setProblem(result.error.message);
      // Токен Turnstile одноразовый — после ошибки виджет нужно прогнать заново.
      setCaptchaToken(null);
      setCaptchaNonce((n) => n + 1);
      return;
    }
    if (!result.data.session) {
      setMessage("Проверь почту — там ссылка для подтверждения");
      return;
    }
    router.replace(next);
    router.refresh();
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">Findots</h1>
      <p className="mb-6 mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Личный трекер расходов. Доходы, кошельки и траты — иконками и
        перетаскиванием.
      </p>

      <form onSubmit={submit}>
        <Field label="Почта">
          <input
            type="email"
            required
            autoComplete="email"
            className={inputClass}
            style={inputStyle}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Пароль" hint={mode === "up" ? "Минимум 6 символов" : undefined}>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            className={inputClass}
            style={inputStyle}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {problem ? (
          <p className="mb-3 text-sm" style={{ color: "var(--danger)" }}>
            {problem}
          </p>
        ) : null}
        {message ? (
          <p className="mb-3 text-sm" style={{ color: "var(--ok)" }}>
            {message}
          </p>
        ) : null}

        <Turnstile onToken={setCaptchaToken} resetKey={captchaNonce} />

        <Button type="submit" disabled={busy || (captchaRequired && !captchaToken)}>
          {busy ? "Минуту…" : mode === "in" ? "Войти" : "Зарегистрироваться"}
        </Button>
      </form>

      <button
        className="mt-4 text-sm underline"
        style={{ color: "var(--muted)" }}
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setProblem(null);
          setMessage(null);
        }}
      >
        {mode === "in" ? "Нет аккаунта — зарегистрироваться" : "Уже есть аккаунт — войти"}
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
