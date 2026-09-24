"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/lib/icons";
import { Logo } from "@/components/Logo";
import { Button, Field, inputClass, inputStyle } from "@/components/ui";

function ruError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login credentials")) return "Неверная почта или пароль";
  if (text.includes("already registered")) return "Эта почта уже зарегистрирована — войдите";
  if (text.includes("email not confirmed")) return "Почта не подтверждена — проверьте письмо";
  const short = message.match(/at least (\d+) characters/i);
  if (short) return `Пароль короче ${short[1]} символов`;
  if (text.includes("failed to fetch")) return "Нет связи с сервером — проверьте интернет";
  return message;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    setMessage(null);
    const supabase = createClient();

    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setProblem(ruError(error.message));
      else router.replace(next);
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}` },
      });
      if (error) setProblem(ruError(error.message));
      else setMessage("Проверьте почту — там письмо со ссылкой");
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo size={56} animated />
          <h1 className="text-lg font-semibold">ToDots</h1>
        </div>

        <form onSubmit={submit}>
          <Field label="Почта">
            <input
              type="email"
              required
              className={inputClass}
              style={inputStyle}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </Field>
          <Field label="Пароль">
            <div className="relative">
              <input
                type={shown ? "text" : "password"}
                required
                minLength={6}
                className={`${inputClass} pr-11`}
                style={inputStyle}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "in" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                onClick={() => setShown((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60"
                aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
              >
                <Icon name={shown ? "eye-off" : "eye"} size={19} />
              </button>
            </div>
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

          <Button type="submit" disabled={busy}>
            {busy ? "Секунду…" : mode === "in" ? "Войти" : "Зарегистрироваться"}
          </Button>
        </form>

        <button
          onClick={() => {
            setMode((m) => (m === "in" ? "up" : "in"));
            setProblem(null);
            setMessage(null);
          }}
          className="mt-4 w-full text-center text-sm"
          style={{ color: "var(--muted)" }}
        >
          {mode === "in" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
