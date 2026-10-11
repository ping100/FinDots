"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { disablePush } from "@/lib/pushClient";
import { CONSENT_PENDING_KEY, TERMS_VERSION, consentMetadata, hasConsent } from "@/lib/legal";
import { ConsentChecks, NO_CONSENT, consentGiven } from "./ConsentChecks";
import { Button } from "./ui";

/** Здесь окно не нужно: вход, сами документы и служебные страницы. */
const OPEN_PATHS = ["/login", "/auth", "/privacy", "/terms", "/set-password"];

/**
 * Разовое окно согласия поверх приложения — для тех, кто ещё не принял
 * текущую редакцию: зарегистрирован до появления галочек, вошёл через
 * Google (Google создаёт учётную запись сам, минуя форму) или документы
 * с тех пор обновились (TERMS_VERSION).
 */
export function ConsentGate() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [consent, setConsent] = useState(NO_CONSENT);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const check = async (next: User | null) => {
      if (!next || hasConsent(next)) {
        setUser(null);
        return;
      }
      // Галочки уже отметили на экране регистрации перед уходом на Google.
      let pending: string | null = null;
      try {
        pending = localStorage.getItem(CONSENT_PENDING_KEY);
      } catch {
        // Нет хранилища — спросим явно.
      }
      if (pending === TERMS_VERSION) {
        const { error } = await supabase.auth.updateUser({ data: consentMetadata() });
        try {
          localStorage.removeItem(CONSENT_PENDING_KEY);
        } catch {}
        if (!error) {
          setUser(null);
          return;
        }
      }
      setUser(next);
    };
    void supabase.auth.getSession().then(({ data }) => check(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void check(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!user || OPEN_PATHS.some((p) => pathname.startsWith(p))) return null;

  const accept = async () => {
    if (!consentGiven(consent) || busy) return;
    setBusy(true);
    setProblem(null);
    const { error } = await createClient().auth.updateUser({ data: consentMetadata() });
    setBusy(false);
    if (error) {
      setProblem("Не получилось сохранить — проверьте интернет и попробуйте ещё раз");
      return;
    }
    setUser(null);
  };

  const signOut = async () => {
    await disablePush().catch(() => undefined);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <div
      className="animate-fade fixed inset-0 z-[70] flex items-center justify-center px-5"
      style={{ background: "color-mix(in srgb, var(--bg) 92%, transparent)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
      >
        <h2 id="consent-title" className="text-lg font-semibold">
          Условия пользования
        </h2>
        <p className="mb-4 mt-1.5 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Чтобы продолжить, примите Пользовательское соглашение и дайте согласие на обработку
          данных. Это нужно сделать один раз — ваши записи никуда не денутся.
        </p>
        <ConsentChecks value={consent} onChange={setConsent} />
        {problem ? (
          <p className="mt-3 text-[0.8125rem]" style={{ color: "var(--danger)" }}>
            {problem}
          </p>
        ) : null}
        <div className="mt-5 space-y-2">
          <Button onClick={() => void accept()} disabled={!consentGiven(consent) || busy}>
            {busy ? "Сохраняю…" : "Принять и продолжить"}
          </Button>
          <Button variant="ghost" onClick={() => void signOut()} disabled={busy}>
            Выйти
          </Button>
        </div>
      </div>
    </div>
  );
}
