"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { Button, Sheet } from "./ui";

/**
 * Инструкция для новичка.
 *
 * Показываем не текстом, а схемами из тех же кружков, что на главном экране:
 * весь смысл приложения в том, куда какой кружок тащить, и объяснить это
 * картинкой втрое короче, чем словами.
 */

type Step = { title: string; text: string; art: React.ReactNode };

const DOT = { income: "#0d9488", wallet: "#3b82f6", expense: "#f59e0b", savings: "#0ea5e9" };

function Dot({ color, icon, label, dim }: { color: string; icon: string; label?: string; dim?: boolean }) {
  return (
    <span className="flex flex-col items-center gap-1" style={{ opacity: dim ? 0.35 : 1 }}>
      <span
        className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-white"
        style={{ background: color, boxShadow: `0 4px 14px ${color}55` }}
      >
        <Icon name={icon} size={24} />
      </span>
      {label ? (
        <span className="text-[0.625rem]" style={{ color: "var(--muted)" }}>
          {label}
        </span>
      ) : null}
    </span>
  );
}

/** Стрелка «перетащи отсюда сюда» — тот же жест, что пальцем по экрану. */
function Arrow() {
  return (
    <span className="flex items-center" style={{ color: "var(--muted)" }}>
      <svg width="44" height="18" viewBox="0 0 44 18" fill="none">
        <path
          d="M2 9h34"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="4 4"
        />
        <path
          d="M34 3l6 6-6 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function Scene({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-4 flex min-h-[124px] items-center justify-center gap-3 rounded-2xl px-4 py-5"
      style={{ background: "var(--surface-2)" }}
    >
      {children}
    </div>
  );
}

const STEPS: Step[] = [
  {
    title: "Четыре блока",
    text: "Доходы — откуда деньги приходят. Кошельки — где они лежат. Расходы — на что уходят. Накопления — что отложено и не считается свободным.",
    art: (
      <Scene>
        <Dot color={DOT.income} icon="briefcase" label="доход" />
        <Dot color={DOT.wallet} icon="card" label="кошелёк" />
        <Dot color={DOT.expense} icon="cart" label="расход" />
        <Dot color={DOT.savings} icon="savings" label="копилка" />
      </Scene>
    ),
  },
  {
    title: "Сначала заведите свои кружки",
    text: "В каждом блоке есть «+». Нажмите и задайте название, цвет и иконку — готовых банков и категорий нет, всё под себя.",
    art: (
      <Scene>
        <span
          className="flex h-[52px] w-[52px] items-center justify-center rounded-full border"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}
        >
          <Icon name="plus" size={24} />
        </span>
        <Arrow />
        <Dot color={DOT.wallet} icon="card" label="Kaspi" />
      </Scene>
    ),
  },
  {
    title: "Записать доход — тап",
    text: "Нажмите на кружок дохода и введите сумму. Она попадёт в доходы, но ещё не в кошелёк.",
    art: (
      <Scene>
        <Dot color={DOT.income} icon="briefcase" label="Зарплата" />
        <span className="text-2xl font-bold tabular-nums">620 000 ₸</span>
      </Scene>
    ),
  },
  {
    title: "Разложить по кошелькам — перетаскиванием",
    text: "Задержите палец на кружке дохода и перетащите его на кошелёк. Спросим, сколько именно перенести — один доход можно разбить на несколько кошельков.",
    art: (
      <Scene>
        <Dot color={DOT.income} icon="briefcase" label="Зарплата" />
        <Arrow />
        <Dot color={DOT.wallet} icon="card" label="Kaspi" />
      </Scene>
    ),
  },
  {
    title: "Записать трату",
    text: "Перетащите кошелёк на категорию расхода — так быстрее всего. Или просто нажмите на категорию и выберите, откуда списать.",
    art: (
      <Scene>
        <Dot color={DOT.wallet} icon="card" label="Kaspi" />
        <Arrow />
        <Dot color={DOT.expense} icon="cart" label="Продукты" />
      </Scene>
    ),
  },
  {
    title: "Главная цифра — сверху",
    text: "«Можно тратить сегодня» = деньги в кошельках минус обязательные платежи, делённые на дни до конца месяца. Перебрали сегодня — завтра цифра станет меньше.",
    art: (
      <Scene>
        <div className="text-center">
          <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            Можно тратить сегодня
          </p>
          <p className="text-[1.625rem] font-bold leading-tight tabular-nums">40 044 ₸</p>
          <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            осталось 9 дней
          </p>
        </div>
      </Scene>
    ),
  },
  {
    title: "Ошиблись — поправимо",
    text: "Любую операцию можно изменить или удалить в «Истории»: балансы пересчитаются сами. Лимиты по категориям, долги и отчёты — на своих вкладках внизу.",
    art: (
      <Scene>
        <Dot color={DOT.expense} icon="cart" />
        <span style={{ color: "var(--muted)" }}>
          <Icon name="close" size={20} />
        </span>
        <Dot color={DOT.wallet} icon="card" />
      </Scene>
    ),
  },
];

export function Guide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <Sheet
      open={open}
      title={`Как пользоваться · ${step + 1} из ${STEPS.length}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              Назад
            </Button>
          ) : null}
          <Button onClick={() => (last ? onClose() : setStep((s) => s + 1))}>
            {last ? "Всё понятно" : "Дальше"}
          </Button>
        </div>
      }
    >
      {/* key — чтобы появление проигрывалось на каждом шаге, а не один раз */}
      <div key={step} className="animate-rise">
        {current.art}
        <h3 className="mb-1.5 text-lg font-semibold">{current.title}</h3>
        <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
          {current.text}
        </p>
      </div>

      <div className="flex justify-center gap-1.5 py-5">
        {STEPS.map((item, i) => (
          <button
            key={item.title}
            onClick={() => setStep(i)}
            aria-label={`Шаг ${i + 1}`}
            className="h-1.5 rounded-full transition-all"
            style={{
              width: i === step ? 18 : 6,
              background: i === step ? "var(--accent)" : "var(--border)",
            }}
          />
        ))}
      </div>
    </Sheet>
  );
}
