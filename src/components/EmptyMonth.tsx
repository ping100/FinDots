"use client";

import { Logo } from "./Logo";

/**
 * Месяц без единой записи: вместо блоков с нулями — знак Dots и три шага,
 * с чего начать. Исчезает сам после первой операции.
 */
export function EmptyMonth({ past, hasWallets, hasIncome }: { past: boolean; hasWallets: boolean; hasIncome: boolean }) {
  if (past) {
    return (
      <div className="money-card mb-3 flex items-center gap-3 rounded-[1.375rem] px-4 py-3">
        <span style={{ opacity: 0.5 }}>
          <Logo size={34} focus="money" />
        </span>
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          В этом месяце записей нет
        </span>
      </div>
    );
  }

  const fresh = !hasWallets && !hasIncome;
  const steps = [
    ...(!hasIncome || !hasWallets
      ? [`Заведите ${!hasIncome && !hasWallets ? "источник дохода и кошелёк" : !hasIncome ? "источник дохода" : "кошелёк"} — кнопкой «+» в блоках ниже`]
      : []),
    "Пришли деньги — нажмите на доход и введите сумму",
    "Перетащите доход в кошелёк, а кошелёк — на расход",
  ];

  return (
    <div className="money-card mb-3 rounded-[1.375rem] px-4 py-4">
      <div className="flex items-center gap-3">
        <Logo size={40} animated focus="money" />
        <div>
          <p className="text-[0.9375rem] font-semibold">{fresh ? "Добро пожаловать в Findots" : "Новый месяц — чистый лист"}</p>
          <p className="text-[0.75rem]" style={{ color: "var(--muted)" }}>
            {fresh ? "Три шага — и деньги под контролем" : "Пока ни одной записи. С чего начать:"}
          </p>
        </div>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((text, i) => (
          <li key={text} className="flex items-start gap-2.5 text-[0.8125rem] leading-snug">
            <span
              className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold text-white"
              style={{ background: ["#22c55e", "#60a5fa", "#ec4899"][i % 3] }}
            >
              {i + 1}
            </span>
            {text}
          </li>
        ))}
      </ol>
    </div>
  );
}
