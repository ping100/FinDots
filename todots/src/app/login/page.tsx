"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/lib/icons";
import { useProvider } from "@/lib/providers";
import { rememberedTheme } from "@/lib/look";
import { Logo } from "@/components/Logo";
import { GoogleButton } from "@/components/GoogleButton";
import { Button, Field, inputClass, inputStyle } from "@/components/ui";

/**
 * Supabase отвечает по-английски, а тестируют приложение обычные люди.
 * Переводим то, что реально встречается на входе; остальное показываем как
 * есть — лучше непонятная строка, чем проглоченная ошибка.
 */
function ruError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login credentials")) return "Неверная почта или пароль";
  if (text.includes("already registered")) return "Эта почта уже зарегистрирована — войдите";
  if (text.includes("email not confirmed")) return "Почта не подтверждена — проверьте письмо";
  const short = message.match(/at least (\d+) characters/i);
  if (short) return `Пароль короче ${short[1]} символов`;
  if (text.includes("password should be")) return "Пароль слишком простой";
  if (text.includes("unable to validate email")) return "Проверьте адрес почты";
  if (text.includes("failed to fetch")) return "Нет связи с сервером — проверьте интернет";
  const wait = message.match(/after (\d+) seconds?/i);
  if (wait) return `Слишком часто. Попробуйте через ${wait[1]} с`;
  return message;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const googleReady = useProvider("google");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (params.get("error")) setProblem("Вход через Google не завершился — попробуйте ещё раз");
  }, [params]);

  // До входа профиля ещё нет. Если на этом устройстве уже выбирали тему —
  // держим её: скрипт в <head> её уже поставил, и трогать не надо. Если
  // человек здесь впервые, следим за системной, чтобы с тёмным телефоном он
  // не получил вспышку белого. После входа тему поставит DataProvider.
  useEffect(() => {
    if (rememberedTheme()) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setMessage(null);
    const supabase = createClient();

    const result =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${location.origin}/auth/callback` },
          });

    setBusy(false);

    if (result.error) {
      setProblem(ruError(result.error.message));
      return;
    }
    if (!result.data.session) {
      setMessage("Проверьте почту — там ссылка для подтверждения");
      return;
    }
    router.replace(next);
    router.refresh();
  };

  const withGoogle = async () => {
    setBusy(true);
    setProblem(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setBusy(false);
      setProblem(ruError(error.message));
    }
  };

  const switchTo = (value: "in" | "up") => {
    setMode(value);
    setProblem(null);
    setMessage(null);
  };

  return (
    <div className="auth-glow mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo size={76} animated />
        <h1
          className="animate-lift mt-4 text-[1.75rem] font-semibold tracking-tight"
          style={{ animationDelay: "260ms" }}
        >
          ToDots
        </h1>
        <p
          className="animate-lift mt-1.5 text-sm leading-snug"
          style={{ color: "var(--muted)", animationDelay: "330ms" }}
        >
          Задачи и напоминания: что сегодня, что потом и что можно не держать в голове
        </p>
      </div>

      {/* Переключатель наверху, а не ссылкой внизу: человек должен видеть,
          что он сейчас делает, до того как заполнит поля. */}
      <div
        className="animate-lift mb-5 grid grid-cols-2 gap-1 rounded-2xl p-1"
        style={{ background: "var(--surface-2)", animationDelay: "400ms" }}
      >
        {(["in", "up"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => switchTo(value)}
            aria-pressed={mode === value}
            className="rounded-xl py-2.5 text-sm font-medium transition"
            style={{
              background: mode === value ? "var(--surface)" : "transparent",
              color: mode === value ? "var(--text)" : "var(--muted)",
              boxShadow: mode === value ? "0 1px 3px rgba(0,0,0,0.10)" : undefined,
            }}
          >
            {value === "in" ? "Вход" : "Регистрация"}
          </button>
        ))}
      </div>

      {googleReady ? (
        <div className="animate-lift mb-4" style={{ animationDelay: "440ms" }}>
          <GoogleButton
            label={mode === "in" ? "Войти через Google" : "Продолжить с Google"}
            onClick={() => void withGoogle()}
            disabled={busy}
          />
          <div className="mt-4 flex items-center gap-3" style={{ color: "var(--muted)" }}>
            <span className="h-px flex-1" style={{ background: "var(--border)" }} />
            <span className="text-[0.6875rem]">или по почте</span>
            <span className="h-px flex-1" style={{ background: "var(--border)" }} />
          </div>
        </div>
      ) : null}

      <form
        onSubmit={submit}
        className="animate-lift rounded-3xl p-5"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          animationDelay: "470ms",
        }}
      >
        <Field label="Почта">
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            className={inputClass}
            style={inputStyle}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Пароль" hint={mode === "up" ? "Минимум 6 символов" : undefined}>
          <div className="relative">
            <input
              type={shown ? "text" : "password"}
              required
              minLength={6}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
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
          <p className="animate-rise mb-3 text-sm" style={{ color: "var(--danger)" }}>
            {problem}
          </p>
        ) : null}
        {message ? (
          <p className="animate-rise mb-3 text-sm" style={{ color: "var(--ok)" }}>
            {message}
          </p>
        ) : null}

        <Button type="submit" disabled={busy}>
          {busy ? "Минуту…" : mode === "in" ? "Войти" : "Создать аккаунт"}
        </Button>
      </form>

      <p
        className="animate-lift mt-5 text-center text-xs leading-snug"
        style={{ color: "var(--muted)", animationDelay: "540ms" }}
      >
        Задачи видите только вы: каждая запись привязана к вашей учётной записи
        и закрыта на стороне базы.
      </p>
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
