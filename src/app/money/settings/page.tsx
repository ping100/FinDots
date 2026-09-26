"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TEXT_SCALES } from "@/lib/textScale";
import { THEMES, THEME_AUTO_HINT } from "@/lib/look";
import { CURRENT_BUILD, applyUpdate, buildMoment, serverBuild } from "@/lib/update";
import { Icon } from "@/lib/icons";
import { CURRENCIES, parseAmount, symbolOf } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/components/DataProvider";
import { DataTransfer } from "@/components/DataTransfer";
import { ResetMoneyData } from "@/components/ResetMoneyData";
import { StatementImport } from "@/components/StatementImport";
import { Guide } from "@/components/Guide";
import { SignInMethods } from "@/components/SignInMethods";
import { UserNumber } from "@/components/UserNumber";
import { SupportRow } from "@/components/SupportRow";
import { ReviewRow } from "@/components/ReviewRow";
import { SettingsHeading } from "@/components/SettingsHeading";
import { PrivacyLink } from "@/components/PrivacyLink";
import { disablePush } from "@/lib/pushClient";
import { AccountCard } from "@/components/AccountCard";
import { AppSwitch } from "@/components/AppSwitch";
import { AdminLink } from "@/components/AdminLink";
import { Field, Sheet, inputClass, inputStyle } from "@/components/ui";

export default function SettingsPage() {
  const router = useRouter();
  const { profile, rates, saveProfile, saveRate } = useStore();
  const [sheet, setSheet] = useState<"currency" | "rates" | "theme" | "size" | null>(null);
  const [guide, setGuide] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateNote, setUpdateNote] = useState<string | null>(null);
  // Считаем после отрисовки: строка зависит от часового пояса телефона, а
  // на сервере он другой — React заметил бы расхождение.
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  useEffect(() => setUpdatedAt(buildMoment()), []);

  const checkUpdate = async () => {
    if (checking) return;
    setChecking(true);
    setUpdateNote(null);
    const build = await serverBuild();
    if (!build) setUpdateNote("Не дозвонились до сервера — проверьте интернет");
    else if (build === CURRENT_BUILD) setUpdateNote("У вас последняя версия");
    else {
      setUpdateNote("Есть новая версия, обновляю…");
      await applyUpdate();
      return;
    }
    setChecking(false);
  };

  const base = profile?.base_currency ?? "KZT";

  const signOut = async () => {
    // Вышел — напоминания этого человека сюда больше не идут.
    await disablePush().catch(() => undefined);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <h1 className="py-2 text-[1.625rem] font-semibold">Настройки</h1>

      <SettingsHeading>Профиль</SettingsHeading>
      <Group>
        <AccountCard
          name={profile?.display_name}
          hint="Данные привязаны к этой учётной записи и видны только вам"
          onSaveName={(display_name) => saveProfile({ display_name })}
        />
        <UserNumber />
        <SignInMethods />
      </Group>

      <SettingsHeading>Деньги</SettingsHeading>
      <Group>
        <Row
          label="Основная валюта"
          value={`${symbolOf(base)} ${base}`}
          onClick={() => setSheet("currency")}
        />
        <Row
          label="Курсы валют"
          hint="Задаются вручную — автоподгрузки курсов нет"
          onClick={() => setSheet("rates")}
        />
      </Group>

      <SettingsHeading>Оформление</SettingsHeading>
      <Group>
        <Row
          label="Тема"
          value={THEMES.find((item) => item.id === profile?.theme)?.label ?? "Светлая"}
          onClick={() => setSheet("theme")}
        />
        <Row
          label="Размер шрифта"
          value={TEXT_SCALES.find((item) => item.id === profile?.text_scale)?.label ?? "Средний"}
          hint="Если цифры трудно разглядеть"
          onClick={() => setSheet("size")}
        />
      </Group>

      <SettingsHeading hint="Выписка из банка, перенос из другой программы и резервная копия. Выписка читается на устройстве и никуда не отправляется.">
        Данные
      </SettingsHeading>
      <StatementImport />
      <DataTransfer />

      <Group>
        <ResetMoneyData />
      </Group>

      <SettingsHeading>Помощь</SettingsHeading>
      <Group>
        <Row
          label="Как пользоваться"
          hint="Та же инструкция, что после регистрации — можно открыть в любой момент"
          onClick={() => setGuide(true)}
        />
        <PrivacyLink from="/money/settings" />
      </Group>
      <button
        onClick={() => setGuide(true)}
        className="-mt-2 mb-4 w-full px-1 text-left text-[0.6875rem] leading-snug underline"
        style={{ color: "var(--muted)" }}
      >
        Кошельки и категории правятся на «Панели»: тап по кошельку, долгое
        нажатие на категории расхода, «Настроить категорию» в окне дохода.
        Подробнее — в инструкции.
      </button>
      <SupportRow />
      <ReviewRow />

      <SettingsHeading>Приложения</SettingsHeading>
      <AppSwitch from="money" />
      <AdminLink />

      <Group>
        <Row label="Выйти" danger onClick={signOut} />
      </Group>

      <Group>
        <Row
          label={checking ? "Проверяю…" : "Обновить приложение"}
          value={updatedAt ?? undefined}
          valueLabel="Последнее обновление"
          hint={updateNote ?? "Приложение следит за обновлениями само. Если обещанного не видно — нажмите здесь"}
          onClick={() => void checkUpdate()}
        />
      </Group>


      <Guide open={guide} onClose={() => setGuide(false)} />

      <Sheet open={sheet === "currency"} title="Основная валюта" onClose={() => setSheet(null)}>
        <div className="flex gap-2 pb-2">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              onClick={() => {
                void saveProfile({ base_currency: c.code });
                setSheet(null);
              }}
              className="flex-1 rounded-2xl px-3 py-3 text-sm"
              style={{
                background: base === c.code ? "var(--accent)" : "var(--surface-2)",
                color: base === c.code ? "#fff" : "inherit",
              }}
            >
              {c.symbol} {c.code}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === "rates"} title="Курсы валют" onClose={() => setSheet(null)}>
        <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
          Сколько {base} стоит одна единица валюты.
        </p>
        {CURRENCIES.filter((c) => c.code !== base).map((c) => (
          <RateRow
            key={c.code}
            code={c.code}
            base={base}
            value={rates.find((r) => r.code === c.code)?.rate_to_base ?? 1}
            onSave={(v) => saveRate(c.code, v)}
          />
        ))}
      </Sheet>

      <Sheet open={sheet === "theme"} title="Тема" onClose={() => setSheet(null)}>
        <div className="flex gap-2">
          {THEMES.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => {
                void saveProfile({ theme: id });
                setSheet(null);
              }}
              className="flex-1 rounded-2xl px-3 py-3 text-sm"
              style={{
                background: profile?.theme === id ? "var(--accent)" : "var(--surface-2)",
                color: profile?.theme === id ? "#fff" : "inherit",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="pb-2 pt-3 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
          {THEME_AUTO_HINT}
        </p>
      </Sheet>

      <Sheet open={sheet === "size"} title="Размер шрифта" onClose={() => setSheet(null)}>
        <div className="space-y-2 pb-2">
          {TEXT_SCALES.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                void saveProfile({ text_scale: item.id });
                setSheet(null);
              }}
              className="flex w-full items-baseline gap-2 rounded-2xl px-4 py-3.5 text-left"
              style={{
                background:
                  (profile?.text_scale ?? "medium") === item.id ? "var(--accent)" : "var(--surface-2)",
                color: (profile?.text_scale ?? "medium") === item.id ? "#fff" : "inherit",
              }}
            >
              {/* Размер названия показывает сам результат выбора */}
              <span
                className="font-semibold"
                style={{ fontSize: `${item.factor}rem` }}
              >
                {item.label}
              </span>
              <span className="text-[0.6875rem] opacity-70">{item.hint}</span>
            </button>
          ))}
        </div>
        <p className="pb-2 text-xs" style={{ color: "var(--muted)" }}>
          Меняется весь текст в приложении, а на крупном размере кружки на
          «Панели» становятся больше и встают по четыре в ряд вместо пяти.
        </p>
      </Sheet>

    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl" style={{ background: "var(--surface)" }}>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  valueLabel,
  hint,
  danger,
  onClick,
}: {
  label: string;
  value?: string;
  /** Что означает число справа. Без подписи «сегодня, 19:56» ни о чём. */
  valueLabel?: string;
  hint?: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="flex-1">
        <span className="block text-[0.9375rem]" style={{ color: danger ? "var(--danger)" : undefined }}>
          {label}
        </span>
        {hint ? (
          <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
            {hint}
          </span>
        ) : null}
      </span>
      {value ? (
        <span className="shrink-0 text-right">
          {valueLabel ? (
            <span className="block text-[0.625rem]" style={{ color: "var(--muted)" }}>
              {valueLabel}
            </span>
          ) : null}
          <span className="block text-[0.9375rem]" style={{ color: "var(--muted)" }}>
            {value}
          </span>
        </span>
      ) : null}
      {onClick && !danger ? (
        <Icon name="chevron-right" size={16} className="opacity-30" />
      ) : null}
    </>
  );

  const className =
    "flex w-full items-center gap-3 px-4 py-3.5 text-left [&:not(:first-child)]:border-t";
  const style = { borderColor: "var(--border)" };

  return onClick ? (
    <button onClick={onClick} className={className} style={style}>
      {content}
    </button>
  ) : (
    <div className={className} style={style}>
      {content}
    </div>
  );
}

function RateRow({
  code,
  base,
  value,
  onSave,
}: {
  code: string;
  base: string;
  value: number;
  onSave: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  return (
    <Field label={`1 ${code} = ? ${base}`}>
      <input
        className={inputClass}
        style={inputStyle}
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const parsed = parseAmount(draft);
          if (parsed && parsed > 0) onSave(parsed);
          else setDraft(String(value));
        }}
      />
    </Field>
  );
}
