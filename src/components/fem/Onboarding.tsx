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
 * Первый вход в FemDots. Сначала — «Кто вы?»: девушке три вопроса о цикле
 * и согласие на обработку данных о здоровье (без него дальше нельзя —
 * особая категория данных), мужчине — только вход по коду партнёрши:
 * свой цикл ему ни к чему. Ответ хранится в профиле.
 */
export function Onboarding() {
  const { profile, saveProfile, saveSettings, startPeriod } = useFem();
  const gender = profile?.gender ?? null;
  const [last, setLast] = useState("");
  const [cycle, setCycle] = useState(28);
  const [length, setLength] = useState(5);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
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
          {gender === "male"
            ? "Здесь вы увидите цикл своей девушки — когда она пригласит вас."
            : gender === "female"
              ? "Календарь цикла: прогноз месячных и овуляции, самочувствие по дням. Три вопроса — и готово."
              : "Календарь цикла и партнёрский режим. Для начала — кто вы?"}
        </p>
      </div>

      {gender === null ? (
        <>
          <div className="space-y-3">
            <WhoCard
              icon="flower"
              bg={FEM_GRADIENT}
              title="Я девушка"
              hint="Веду свой цикл: прогноз месячных, самочувствие, напоминания"
              onClick={() => void saveProfile({ gender: "female" })}
            />
            <WhoCard
              icon="heart"
              bg="linear-gradient(150deg, #818cf8, #6366f1)"
              title="Я мужчина"
              hint="Смотрю цикл своей девушки — по её приглашению"
              onClick={() => void saveProfile({ gender: "male" })}
            />
          </div>
          <Link href="/" className="mt-6 block text-center text-sm" style={{ color: "var(--muted)" }}>
            ← На главную Dots
          </Link>
        </>
      ) : gender === "male" ? (
        <>
          <PartnerJoin />
          <div className="fem-card mb-4 rounded-3xl p-4 text-[0.8125rem] leading-snug">
            <p className="font-semibold">Где взять код</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4" style={{ color: "var(--muted)" }}>
              <li>Девушка открывает FemDots → Настройки → «Пригласить партнёра».</li>
              <li>Копирует код из 8 знаков и присылает вам — вставьте его в поле выше.</li>
            </ol>
            <p className="mt-2" style={{ color: "var(--muted)" }}>
              Вы будете видеть только то, чем она поделится. Отметить что-то за неё нельзя.
            </p>
          </div>
          <ChangeWho onClick={() => void saveProfile({ gender: null })} />
          <Link href="/" className="mt-4 block text-center text-sm" style={{ color: "var(--muted)" }}>
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
      <ChangeWho onClick={() => void saveProfile({ gender: null })} />
      <Link href="/" className="mt-4 block text-center text-sm" style={{ color: "var(--muted)" }}>
        ← На главную Dots
      </Link>
      </>
      )}
    </div>
  );
}

function WhoCard({
  icon,
  bg,
  title,
  hint,
  onClick,
}: {
  icon: string;
  bg: string;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="fem-card flex w-full items-center gap-4 rounded-3xl p-4 text-left transition active:scale-[0.98]">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: bg }}>
        <Icon name={icon} size={28} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.0625rem] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
      </span>
      <Icon name="chevron-right" size={18} className="opacity-30" />
    </button>
  );
}

/** Ошиблись на первом шаге — вернуться к «Кто вы?». */
function ChangeWho({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-4 block w-full text-center text-[0.8125rem] underline" style={{ color: "var(--muted)" }}>
      Выбрали не то? Изменить
    </button>
  );
}
