"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/lib/icons";
import { Logo } from "@/components/Logo";
import { TURNSTILE_SITE_KEY, Turnstile } from "@/components/Turnstile";
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
  if (text.includes("password should be")) return "Пароль короче 6 символов";
  if (text.includes("unable to validate email")) return "Проверьте адрес почты";
  if (text.includes("failed to fetch")) return "Нет связи с сервером — проверьте интернет";
  const wait = message.match(/after (\d+) seconds?/i);
  if (wait) return `Слишком часто. Попробуйте через ${wait[1]} с`;
  return message;
}

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0);

  // Без ключа капчи её просто нет, и вход ничем не отличается от прежнего.
  const captchaRequired = !!TURNSTILE_SITE_KEY;

  // До входа профиля ещё нет, а значит нет и сохранённой темы. Берём
  // системную: человеку с тёмным телефоном не за что получать вспышку
  // белого экрана. После входа тему переставит DataProvider по профилю.
  useEffect(() => {
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
      setProblem(ruError(result.error.message));
      // Токен Turnstile одноразовый — после ошибки виджет нужно прогнать заново.
      setCaptchaToken(null);
      setCaptchaNonce((n) => n + 1);
      return;
    }
    if (!result.data.session) {
      setMessage("Проверьте почту — там ссылка для подтверждения");
      return;
    }
    router.replace(next);
    router.refresh();
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
          Findots
        </h1>
        <p
          className="animate-lift mt-1.5 text-sm leading-snug"
          style={{ color: "var(--muted)", animationDelay: "330ms" }}
        >
          Личные финансы: сколько есть, сколько ушло и сколько можно потратить сегодня
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

        <Turnstile onToken={setCaptchaToken} resetKey={captchaNonce} />

        <Button type="submit" disabled={busy || (captchaRequired && !captchaToken)}>
          {busy ? "Минуту…" : mode === "in" ? "Войти" : "Создать аккаунт"}
        </Button>
      </form>

      <p
        className="animate-lift mt-5 text-center text-xs leading-snug"
        style={{ color: "var(--muted)", animationDelay: "540ms" }}
      >
        Данные видите только вы: каждая запись привязана к вашей учётной записи
        и закрыта на стороне базы.
      </p>
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
