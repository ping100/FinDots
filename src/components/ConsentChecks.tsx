"use client";

import Link from "next/link";
import { Icon } from "@/lib/icons";

export interface Consent {
  terms: boolean;
  privacy: boolean;
}

export const NO_CONSENT: Consent = { terms: false, privacy: false };

export const consentGiven = (c: Consent) => c.terms && c.privacy;

/**
 * Две галочки согласия: с Пользовательским соглашением и на обработку
 * персональных данных по Политике. Без обеих учётную запись не создать.
 */
export function ConsentChecks({ value, onChange }: { value: Consent; onChange: (next: Consent) => void }) {
  const link = { color: "var(--accent)" };
  return (
    <div className="space-y-2.5">
      <Check checked={value.terms} onToggle={() => onChange({ ...value, terms: !value.terms })}>
        Принимаю{" "}
        <Link href="/terms" target="_blank" className="font-medium" style={link}>
          Пользовательское соглашение
        </Link>
      </Check>
      <Check checked={value.privacy} onToggle={() => onChange({ ...value, privacy: !value.privacy })}>
        Даю согласие на сбор и обработку персональных данных по{" "}
        <Link href="/privacy" target="_blank" className="font-medium" style={link}>
          Политике конфиденциальности
        </Link>
      </Check>
    </div>
  );
}

function Check({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 text-[0.8125rem] leading-snug">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition"
        style={{
          background: checked ? "var(--accent)" : "transparent",
          borderColor: checked ? "var(--accent)" : "var(--muted)",
          color: "#fff",
        }}
      >
        {checked ? <Icon name="check" size={13} /> : null}
      </button>
      {/* Текст тоже переключает галочку, но не ссылки внутри него. */}
      <span
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) return;
          onToggle();
        }}
      >
        {children}
      </span>
    </div>
  );
}
