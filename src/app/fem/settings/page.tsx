"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { THEMES, THEME_AUTO_HINT } from "@/lib/look";
import { TEXT_SCALES } from "@/lib/textScale";
import { createClient } from "@/lib/supabase/client";
import { disablePush } from "@/lib/pushClient";
import { CURRENT_BUILD, applyUpdate, buildMoment, serverBuild } from "@/lib/update";
import { useFem } from "@/components/fem/DataProvider";
import { FemHeader } from "@/components/fem/Shell";
import { Stepper } from "@/components/fem/parts";
import { PartnerJoin, PartnerShare } from "@/components/fem/PartnerShare";
import { PushSettings } from "@/components/PushSettings";
import { SettingsHeading } from "@/components/SettingsHeading";
import { PrivacyLink, TermsLink } from "@/components/PrivacyLink";
import { HomeLink } from "@/components/HomeLink";
import { AdminLink } from "@/components/AdminLink";
import { AccountCard } from "@/components/AccountCard";
import { UserNumber } from "@/components/UserNumber";
import { SignInMethods } from "@/components/SignInMethods";
import { SupportRow } from "@/components/SupportRow";
import { ReviewRow } from "@/components/ReviewRow";
import { DeleteAccount } from "@/components/DeleteAccount";
import { Button, Switch, inputClass, inputStyle } from "@/components/ui";
import { averageCycle, averagePeriod, cycleLengths } from "@/lib/fem/cycle";

/**
 * Настройки FemDots: общее для всех приложений Dots (профиль, вход,
 * оформление, помощь, выход) — как в Findots и Todots, — плюс своё:
 * цикл, партнёр, напоминания и данные о здоровье.
 */
export default function FemSettingsPage() {
  const router = useRouter();
  const { profile, settings, periods, saveSettings, saveProfile, deleteAll } = useFem();
  const [confirming, setConfirming] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateNote, setUpdateNote] = useState<string | null>(null);
  // Считаем после отрисовки: строка зависит от часового пояса телефона.
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  useEffect(() => setUpdatedAt(buildMoment()), []);
  const s = settings!;
  const known = cycleLengths(periods).length;

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

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <FemHeader title="Настройки" sub="FemDots" />

      <SettingsHeading>Профиль</SettingsHeading>
      <div className="fem-card mb-4 overflow-hidden rounded-2xl">
        <AccountCard
          name={profile?.display_name}
          hint="Данные о цикле привязаны к этой учётной записи и видны только вам"
          onSaveName={(display_name) => saveProfile({ display_name })}
        />
        <UserNumber />
        <SignInMethods />
      </div>

      <SettingsHeading>Цикл</SettingsHeading>
      <div className="fem-card mb-1 rounded-2xl p-4">
        <Stepper label="Обычная длина цикла" value={s.cycle_length} min={15} max={60} unit="дней"
          onChange={(v) => void saveSettings({ cycle_length: v })} />
        <Stepper label="Сколько идут месячные" value={s.period_length} min={1} max={15} unit="дней"
          onChange={(v) => void saveSettings({ period_length: v })} />
      </div>
      <p className="mb-4 px-1 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
        {known > 0
          ? `Прогноз уже считается по вашим отметкам: цикл ~${averageCycle(periods, s.cycle_length)} дн., месячные ~${averagePeriod(periods, s.period_length)} дн. Эти числа — запасные.`
          : "Пока отметок мало, прогноз считается по этим числам. Потом — по вашим циклам."}
      </p>

      <SettingsHeading>Партнёр</SettingsHeading>
      <PartnerShare />
      <PartnerJoin />

      <SettingsHeading>Напоминания</SettingsHeading>
      <PushSettings />
      <div className="fem-card mb-4 overflow-hidden rounded-2xl">
        <Row title="Скоро месячные" hint="За 2 дня до прогноза" on={s.remind_period} onChange={(v) => void saveSettings({ remind_period: v })} />
        <Row title="Фертильное окно" hint="В первый день окна" on={s.remind_fertile} onChange={(v) => void saveSettings({ remind_fertile: v })} divided />
        <Row title="Таблетка" hint="Каждый день в выбранное время" on={s.pill_on} onChange={(v) => void saveSettings({ pill_on: v })} divided />
        {s.pill_on ? (
          <div className="px-4 pb-3">
            <input type="time" className={inputClass} style={inputStyle} value={s.pill_at}
              onChange={(e) => e.target.value && void saveSettings({ pill_at: e.target.value })} />
          </div>
        ) : null}
        <Row
          title="Скрытые уведомления"
          hint="На экране блокировки — без подробностей: «FemDots: загляните в календарь»"
          on={s.discreet}
          onChange={(v) => void saveSettings({ discreet: v })}
          divided
        />
      </div>

      <SettingsHeading>Данные</SettingsHeading>
      <div className="fem-card mb-4 rounded-2xl p-4">
        <p className="mb-3 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Данные о цикле и самочувствии видите только вы — даже администратор Dots к ним доступа не имеет.
        </p>
        <Button
          variant={confirming ? "danger" : "ghost"}
          onClick={async () => {
            if (!confirming) {
              setConfirming(true);
              return;
            }
            await deleteAll();
          }}
        >
          {confirming ? "Нажмите ещё раз — удалить всё насовсем" : "Удалить все данные FemDots"}
        </Button>
      </div>

      <SettingsHeading hint={THEME_AUTO_HINT}>Оформление</SettingsHeading>
      <div className="fem-card mb-4 space-y-3 rounded-2xl p-4">
        <div>
          <p className="mb-2 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            Тема — общая для всех приложений Dots
          </p>
          <div className="flex gap-2">
            {THEMES.map(({ id, label }) => (
              <Choice key={id} on={profile?.theme === id} onClick={() => void saveProfile({ theme: id })}>
                {label}
              </Choice>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            Размер шрифта
          </p>
          <div className="flex gap-2">
            {TEXT_SCALES.map((item) => (
              <Choice
                key={item.id}
                on={(profile?.text_scale ?? "medium") === item.id}
                onClick={() => void saveProfile({ text_scale: item.id })}
                // Размер надписи и есть предпросмотр выбора.
                fontSize={`${0.875 * item.factor}rem`}
              >
                {item.label}
              </Choice>
            ))}
          </div>
        </div>
      </div>

      <SettingsHeading>Помощь</SettingsHeading>
      <div className="fem-card mb-4 overflow-hidden rounded-2xl">
        <PrivacyLink from="/fem/settings" />
        <TermsLink from="/fem/settings" />
      </div>
      <SupportRow />
      <ReviewRow app="fem" />

      <SettingsHeading>Приложения</SettingsHeading>
      <HomeLink />
      <AdminLink />

      <div className="fem-card mb-4 overflow-hidden rounded-2xl">
        <button
          onClick={async () => {
            // Вышла — напоминания этого человека сюда больше не идут.
            await disablePush().catch(() => undefined);
            await createClient().auth.signOut();
            router.replace("/login");
          }}
          className="flex w-full items-center px-4 py-3.5 text-left text-[0.9375rem]"
          style={{ color: "var(--danger)" }}
        >
          Выйти
        </button>
        <DeleteAccount />
      </div>

      <div className="fem-card mb-4 overflow-hidden rounded-2xl">
        <button onClick={() => void checkUpdate()} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
          <span className="flex-1">
            <span className="block text-[0.9375rem]">{checking ? "Проверяю…" : "Обновить приложение"}</span>
            <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
              {updateNote ?? "Приложение следит за обновлениями само. Если обещанного не видно — нажмите здесь"}
            </span>
          </span>
          {updatedAt ? (
            <span className="shrink-0 text-right">
              <span className="block text-[0.625rem]" style={{ color: "var(--muted)" }}>
                Последнее обновление
              </span>
              <span className="block text-[0.9375rem]" style={{ color: "var(--muted)" }}>
                {updatedAt}
              </span>
            </span>
          ) : null}
          <Icon name="chevron-right" size={16} className="opacity-30" />
        </button>
      </div>
    </div>
  );
}

function Choice({
  on,
  onClick,
  fontSize,
  children,
}: {
  on: boolean;
  onClick: () => void;
  fontSize?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="flex-1 rounded-2xl border px-3 py-2.5 text-sm font-medium transition active:scale-95"
      style={{
        fontSize,
        borderColor: on ? "var(--accent)" : "var(--border)",
        background: on ? "var(--surface-2)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

function Row({
  title,
  hint,
  on,
  onChange,
  divided,
}: {
  title: string;
  hint: string;
  on: boolean;
  onChange: (on: boolean) => void;
  divided?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: divided ? "1px solid var(--border)" : undefined }}>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem]">{title}</span>
        <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
      </span>
      <Switch checked={on} onChange={onChange} label={title} />
    </div>
  );
}
