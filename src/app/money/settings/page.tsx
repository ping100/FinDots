"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TEXT_SCALES } from "@/lib/textScale";
import { THEMES, THEME_AUTO_HINT } from "@/lib/look";
import { CURRENT_BUILD, applyUpdate, buildMoment, serverBuild } from "@/lib/update";
import { Icon } from "@/lib/icons";
import { CURRENCIES, parseAmount, symbolOf } from "@/lib/money";
import { DEFAULT_SHOWN, MAX_SHOWN, RATE_CHOICES, symbolFor } from "@/lib/officialRates";
import { createClient } from "@/lib/supabase/client";
import { RATES_KEY, useStore } from "@/components/DataProvider";
import { DataTransfer } from "@/components/DataTransfer";
import { ResetMoneyData } from "@/components/ResetMoneyData";
import { DeleteAccount } from "@/components/DeleteAccount";
import { StatementImport } from "@/components/StatementImport";
import { Guide } from "@/components/Guide";
import { SignInMethods } from "@/components/SignInMethods";
import { UserNumber } from "@/components/UserNumber";
import { SupportRow } from "@/components/SupportRow";
import { ReviewRow } from "@/components/ReviewRow";
import { PushSettings } from "@/components/PushSettings";
import { SettingsHeading } from "@/components/SettingsHeading";
import { PrivacyLink, TermsLink } from "@/components/PrivacyLink";
import { disablePush } from "@/lib/pushClient";
import { AccountCard } from "@/components/AccountCard";
import { AppSwitch } from "@/components/AppSwitch";
import { AdminLink } from "@/components/AdminLink";
import { HomeLink } from "@/components/HomeLink";
import { Button, Field, Sheet, Switch, inputClass, inputStyle } from "@/components/ui";

export default function SettingsPage() {
  const router = useRouter();
  const { profile, rates, saveProfile, saveRate, syncRates } = useStore();
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

      <SettingsHeading>Уведомления</SettingsHeading>
      <PushSettings />

      <SettingsHeading>Деньги</SettingsHeading>
      <Group>
        <Row
          label="Основная валюта"
          value={`${symbolOf(base)} ${base}`}
          onClick={() => setSheet("currency")}
        />
        <Row
          label="Курсы валют"
          hint={`${profile?.rates_auto === false ? "Вручную" : "По курсу Нацбанка"} · показывать: ${(
            profile?.shown_rates ?? DEFAULT_SHOWN
          )
            .map(symbolFor)
            .join(", ")}`}
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
        <TermsLink from="/money/settings" />
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
      <ReviewRow app="money" />

      <SettingsHeading>Приложения</SettingsHeading>
      <HomeLink />
      <AppSwitch from="money" />
      <AdminLink />

      <Group>
        <Row label="Выйти" danger onClick={signOut} />
        <DeleteAccount />
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
        <ShownRates
          base={base}
          shown={profile?.shown_rates ?? DEFAULT_SHOWN}
          onChange={(next) => saveProfile({ shown_rates: next })}
        />
        <RatesAuto auto={profile?.rates_auto !== false} onToggle={(on) => saveProfile({ rates_auto: on })} sync={syncRates} />
        <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
          Сколько {base} стоит одна единица валюты.
        </p>
        {CURRENCIES.filter((c) => c.code !== base).map((c) => (
          <RateRow
            // Новый курс с сервера — новое поле: черновик берёт свежее значение.
            key={`${c.code}-${rates.find((r) => r.code === c.code)?.rate_to_base ?? 1}`}
            code={c.code}
            base={base}
            value={rates.find((r) => r.code === c.code)?.rate_to_base ?? 1}
            readOnly={profile?.rates_auto !== false}
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

/**
 * Какие валюты показывать в строке курса на панели и на главной. До трёх:
 * больше в одну строку не помещается. Порядок — порядок выбора.
 */
function ShownRates({
  base,
  shown,
  onChange,
}: {
  base: string;
  shown: string[];
  onChange: (next: string[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState(shown);
  const full = picked.length >= MAX_SHOWN;
  const toggle = (code: string) => {
    const next = picked.includes(code) ? picked.filter((c) => c !== code) : full ? picked : [...picked, code];
    if (next === picked) return;
    setPicked(next);
    void onChange(next);
  };
  return (
    <div className="mb-4">
      <p className="mb-1 text-[0.9375rem]">Какие валюты показывать</p>
      <p className="mb-2.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        На панели под «Свободно» и на главной, до {MAX_SHOWN}-х. {full ? "Чтобы выбрать другую — снимите одну из выбранных." : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {RATE_CHOICES.filter((c) => c.code !== base).map((c) => {
          const on = picked.includes(c.code);
          return (
            <button
              key={c.code}
              onClick={() => toggle(c.code)}
              aria-pressed={on}
              disabled={!on && full}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition active:scale-95 disabled:opacity-40"
              style={{
                background: on ? "var(--accent)" : "var(--surface-2)",
                color: on ? "#fff" : "var(--text)",
              }}
            >
              <span className="font-semibold">{c.symbol}</span>
              {c.name}
              {on && picked.length > 1 ? (
                <span className="text-[0.625rem] opacity-80">{picked.indexOf(c.code) + 1}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * «Автоматически» сверху листа курсов: переключатель, дата курса и кнопка
 * «Обновить сейчас». Включено — поля ниже только для чтения.
 */
function RatesAuto({
  auto,
  onToggle,
  sync,
}: {
  auto: boolean;
  onToggle: (on: boolean) => Promise<void>;
  sync: () => Promise<{ date: string; source: "nbk" | "open" }>;
}) {
  const [info, setInfo] = useState<{ date?: string; source?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    try {
      setInfo(JSON.parse(localStorage.getItem(RATES_KEY) ?? "null"));
    } catch {
      setInfo(null);
    }
  }, []);

  const refresh = async () => {
    setBusy(true);
    setProblem(null);
    try {
      setInfo(await sync());
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Курс сейчас недоступен");
    } finally {
      setBusy(false);
    }
  };

  const when = info?.date ? info.date.split("-").reverse().join(".") : null;
  const from = info?.source === "open" ? "открытый источник (Нацбанк не ответил)" : "Нацбанк РК";

  return (
    <div className="mb-4 rounded-2xl p-3" style={{ background: "var(--surface-2)" }}>
      <div className="flex items-center gap-3">
        <span className="flex-1 text-[0.9375rem]">
          Обновлять автоматически
          <span className="mt-0.5 block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            {auto
              ? when
                ? `Курс на ${when} — ${from}`
                : "Официальный курс Нацбанка РК, раз в полдня"
              : "Выключено — курсы вводите сами"}
          </span>
        </span>
        <Switch
          checked={auto}
          onChange={(on) => {
            void onToggle(on).then(() => (on ? refresh() : undefined));
          }}
          label="Обновлять курс автоматически"
        />
      </div>
      {auto ? (
        <div className="mt-3">
          <Button variant="ghost" onClick={refresh} disabled={busy}>
            {busy ? "Обновляю…" : "Обновить сейчас"}
          </Button>
        </div>
      ) : null}
      {problem ? (
        <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}
    </div>
  );
}

function RateRow({
  code,
  base,
  value,
  readOnly,
  onSave,
}: {
  code: string;
  base: string;
  value: number;
  readOnly?: boolean;
  onSave: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  return (
    <Field label={`1 ${code} = ? ${base}`}>
      <input
        readOnly={readOnly}
        className={inputClass}
        style={{ ...inputStyle, opacity: readOnly ? 0.7 : 1 }}
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (readOnly) return;
          const parsed = parseAmount(draft);
          if (parsed && parsed > 0) onSave(parsed);
          else setDraft(String(value));
        }}
      />
    </Field>
  );
}
