"use client";

import { useState } from "react";
import { useFem } from "@/components/fem/DataProvider";
import { FemHeader } from "@/components/fem/Shell";
import { Stepper } from "@/components/fem/parts";
import { PartnerJoin, PartnerShare } from "@/components/fem/PartnerShare";
import { PushSettings } from "@/components/PushSettings";
import { SettingsHeading } from "@/components/SettingsHeading";
import { PrivacyLink } from "@/components/PrivacyLink";
import { HomeLink } from "@/components/HomeLink";
import { Button, Switch, inputClass, inputStyle } from "@/components/ui";
import { averageCycle, averagePeriod, cycleLengths } from "@/lib/fem/cycle";

export default function FemSettingsPage() {
  const { settings, periods, saveSettings, deleteAll } = useFem();
  const [confirming, setConfirming] = useState(false);
  const s = settings!;
  const known = cycleLengths(periods).length;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <FemHeader title="Настройки" sub="FemDots" />

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

      <HomeLink />
      <div className="fem-card overflow-hidden rounded-2xl">
        <PrivacyLink from="/fem/settings" />
      </div>
    </div>
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
