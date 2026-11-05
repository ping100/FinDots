"use client";

import { useState } from "react";
import { SettingsHeading } from "@/components/SettingsHeading";
import { Button, Field, FieldGroup, Sheet, inputClass, inputStyle } from "@/components/ui";
import { Chips, PREP, Row } from "@/components/tasks/WellnessSettings";
import { WEEKDAYS, daysLabel, useWellness } from "@/lib/tasks/wellness";

const SLEEP = "#6366f1";

/**
 * Сон в Yumdots: время отбоя и напоминания «скоро спать» / «пора спать».
 * Данные прежние (wellness_settings) — переехал только экран из Todots.
 */
export function SleepSettings() {
  const { settings, save } = useWellness();
  const [open, setOpen] = useState(false);
  if (!settings) return null;
  return (
    <>
      <SettingsHeading>Сон</SettingsHeading>
      <div className="mb-4 overflow-hidden rounded-2xl" style={{ background: "var(--surface)" }}>
        <Row
          icon="moon"
          color={SLEEP}
          title="Напоминать ложиться спать"
          hint={
            settings.sleep_on
              ? `Отбой в ${settings.sleep_at}, ${daysLabel(settings.sleep_days)}${settings.sleep_prep_min ? ` · за ${settings.sleep_prep_min} мин` : ""}`
              : "Заранее и в назначенное время"
          }
          on={settings.sleep_on}
          onToggle={(on) => {
            void save({ sleep_on: on });
            if (on) setOpen(true);
          }}
          onOpen={() => setOpen(true)}
        />
      </div>

      <Sheet open={open} title="Сон" onClose={() => setOpen(false)} footer={<Button onClick={() => setOpen(false)}>Готово</Button>}>
        <p className="mb-3 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Заранее напомню отложить телефон, а в назначенное время — что пора спать.
        </p>
        <Field label="Время отбоя">
          <input type="time" className={inputClass} style={inputStyle} value={settings.sleep_at}
            onChange={(e) => e.target.value && void save({ sleep_at: e.target.value })} />
        </Field>
        <FieldGroup label="Дни">
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = settings.sleep_days.includes(d.iso);
              return (
                <button
                  key={d.iso}
                  onClick={() =>
                    void save({
                      sleep_days: on
                        ? settings.sleep_days.filter((x) => x !== d.iso)
                        : [...settings.sleep_days, d.iso].sort(),
                    })
                  }
                  aria-pressed={on}
                  className="rounded-xl py-2 text-[0.8125rem] font-medium transition active:scale-95"
                  style={{ background: on ? SLEEP : "var(--surface-2)", color: on ? "#fff" : "var(--muted)" }}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        </FieldGroup>
        <FieldGroup label="Напомнить заранее">
          <Chips
            options={PREP.map((p) => ({ value: p.min, label: p.label }))}
            value={settings.sleep_prep_min}
            color={SLEEP}
            onChange={(m) => void save({ sleep_prep_min: m })}
          />
        </FieldGroup>
      </Sheet>
    </>
  );
}
