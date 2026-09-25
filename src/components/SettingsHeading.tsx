/**
 * Подпись раздела настроек: «Профиль», «Оформление», «Помощь»… Одна на оба
 * приложения, чтобы настройки денег и задач читались одинаково.
 */
export function SettingsHeading({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <>
      <h2
        className="mb-1.5 mt-6 px-1 text-[0.75rem] font-semibold uppercase tracking-wide first:mt-2"
        style={{ color: "var(--muted)" }}
      >
        {children}
      </h2>
      {hint ? (
        <p className="-mt-0.5 mb-2 px-1 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
          {hint}
        </p>
      ) : null}
    </>
  );
}
