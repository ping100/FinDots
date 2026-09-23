"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserIdentity } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useProvider } from "@/lib/providers";
import { GoogleMark } from "./GoogleButton";

/**
 * Способы входа в аккаунт: почта и Google рядом, Google можно привязать и
 * отвязать.
 *
 * Последний способ отвязать нельзя — иначе останется аккаунт, в который
 * невозможно войти. Supabase это и сам не даст, но узнавать о таком из
 * английской ошибки уже после нажатия — плохой способ.
 */
const TITLES: Record<string, string> = { email: "Почта", google: "Google" };

export function SignInMethods() {
  const googleReady = useProvider("google");
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { data } = await createClient().auth.getUserIdentities();
    setIdentities(data?.identities ?? []);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const google = identities?.find((item) => item.provider === "google");
  const onlyOne = (identities?.length ?? 0) < 2;

  const link = async () => {
    setBusy(true);
    setProblem(null);
    const { error } = await createClient().auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=/settings` },
    });
    if (error) {
      setBusy(false);
      setProblem(
        /manual linking/i.test(error.message)
          ? "В Supabase не включено ручное связывание аккаунтов"
          : error.message,
      );
    }
    // При успехе страница уходит на google.com — снимать busy незачем.
  };

  const unlink = async () => {
    if (!google) return;
    setBusy(true);
    setProblem(null);
    const { error } = await createClient().auth.unlinkIdentity(google);
    setBusy(false);
    if (error) setProblem(error.message);
    else await reload();
  };

  // Пока не знаем, что привязано, не показываем ничего: мелькнувшее «не
  // привязан», сменившееся на «привязан», только сбивает с толку.
  if (identities === null) return null;

  return (
    // Те же отступы и разделитель, что у соседних строк настроек: блок
    // стоит внутри общей группы и не должен из неё выпадать.
    <div
      className="px-4 py-3.5 [&:not(:first-child)]:border-t"
      style={{ borderColor: "var(--border)" }}
    >
      <p className="text-[0.9375rem]">Способы входа</p>

      <div className="mt-1.5 space-y-1">
        {identities.map((item) => (
          <p key={item.identity_id} className="text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            {TITLES[item.provider] ?? item.provider}
            {item.identity_data?.email ? ` · ${item.identity_data.email}` : ""}
          </p>
        ))}
      </div>

      {googleReady ? (
        <button
          onClick={() => void (google ? unlink() : link())}
          disabled={busy || (!!google && onlyOne)}
          className="mt-3 flex items-center gap-2 rounded-2xl px-3.5 py-2 text-[0.8125rem] font-medium transition active:scale-[0.98] disabled:opacity-45"
          style={{ background: "var(--surface-2)" }}
        >
          <GoogleMark size={16} />
          {busy ? "Минуту…" : google ? "Отвязать Google" : "Привязать Google"}
        </button>
      ) : null}

      {google && onlyOne ? (
        <p className="mt-2 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
          Отвязать нельзя: другого способа войти нет. Сначала добавьте вход по
          почте.
        </p>
      ) : null}

      {problem ? (
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}
    </div>
  );
}
