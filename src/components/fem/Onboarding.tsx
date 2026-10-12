"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/lib/icons";
import { addDays, today } from "@/lib/tasks/dates";
import { FEM_COLOR, FEM_GRADIENT } from "@/lib/fem/cycle";
import { PartnerJoin } from "./PartnerShare";
import { Button, Field, inputClass, inputStyle } from "@/components/ui";
import { useFem } from "./DataProvider";
import { Stepper } from "./parts";

/**
 * Первый вход в FemDots: три вопроса и согласие на обработку данных о
 * здоровье. Без согласия дальше нельзя — это особая категория данных.
 */
export function Onboarding() {
  const { saveSettings, startPeriod } = useFem();
  const [last, setLast] = useState("");
  const [cycle, setCycle] = useState(28);
  const [length, setLength] = useState(5);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  // «Я партнёр»: свой цикл не нужен — только код от девушки.
  const [asPartner, setAsPartner] = useState(false);
  const now = today();

  const start = async () => {
    if (!consent) return;
    setBusy(true);
    await saveSettings({ cycle_length: cycle, period_length: length, consent_at: new Date().toISOString() });
    if (last) {
      const end = addDays(last, length - 1);
      // Если по обычной длине месячные уже должны были закончиться — закрываем
      // отметку сразу; иначе они «идут» и закроются кнопкой.
      await startPeriod(last, end < now ? end : null);
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-12 pt-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <span
          className="animate-pop flex h-20 w-20 items-center justify-center rounded-full text-white"
          style={{ background: FEM_GRADIENT, boxShadow: "0 16px 36px -14px rgba(236,72,153,0.75)" }}
        >
          <Icon name="flower" size={40} />
        </span>
        <h1 className="mt-4 text-[1.5rem] font-semibold">Добро пожаловать в FemDots</h1>
        <p className="mt-1.5 text-sm leading-snug" style={{ color: "var(--muted)" }}>
          Календарь цикла: прогноз месячных и овуляции, самочувствие по дням. Три вопроса — и готово.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl p-1" style={{ background: "var(--surface-2)" }}>
        {[
          { on: !asPartner, label: "Веду свой цикл", set: false },
          { on: asPartner, label: "Я партнёр", set: true },
        ].map((t) => (
          <button
            key={t.label}
            onClick={() => setAsPartner(t.set)}
            className="rounded-xl py-2 text-sm font-medium transition"
            style={{ background: t.on ? "var(--surface)" : "transparent", boxShadow: t.on ? "0 2px 8px rgba(236,72,153,0.15)" : undefined }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {asPartner ? (
        <>
          <PartnerJoin />
          <p className="px-2 text-center text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
            Код даёт девушка: FemDots → Настройки → «Пригласить партнёра». Или просто откройте ссылку, которую она
            прислала.
          </p>
          <Link href="/" className="mt-6 block text-center text-sm" style={{ color: "var(--muted)" }}>
            ← На главную Dots
          </Link>
        </>
      ) : (
      <>
      <div className="fem-card rounded-3xl p-4">
        <Field label="Когда начались последние месячные?">
          <input type="date" className={inputClass} style={inputStyle} value={last} max={now} onChange={(e) => setLast(e.target.value)} />
        </Field>
        <p className="-mt-1 mb-3 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          Не помните точно — можно пропустить и отметить, когда начнутся.
        </p>
        <Stepper label="Сколько обычно длится цикл" value={cycle} min={15} max={60} unit="дней" onChange={setCycle}
          hint="От начала одних месячных до начала следующих. Не знаете — оставьте 28" />
        <Stepper label="Сколько идут месячные" value={length} min={1} max={15} unit="дней" onChange={setLength} />
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 px-1 text-[0.8125rem] leading-snug">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" style={{ accentColor: FEM_COLOR }} />
        <span>
          Даю согласие на обработку данных о здоровье (цикл, самочувствие) по{" "}
          <Link href="/privacy#fem" className="underline" style={{ color: "var(--accent)" }}>
            Политике конфиденциальности
          </Link>
          . Их видите только вы.
        </span>
      </label>

      <div className="mt-5">
        <Button onClick={start} disabled={!consent || busy}>
          {busy ? "Минуту…" : "Начать"}
        </Button>
      </div>
      <p className="mt-3 px-2 text-center text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
        Прогноз — оценка по вашим прошлым циклам. Это не способ предохранения и не медицинский совет.
      </p>
      <Link href="/" className="mt-4 block text-center text-sm" style={{ color: "var(--muted)" }}>
        ← На главную Dots
      </Link>
      </>
      )}
    </div>
  );
}
