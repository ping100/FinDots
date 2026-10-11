"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";
import { usePushState } from "@/components/PushSettings";
import { SettingsHeading } from "@/components/SettingsHeading";
import { Button, Field, FieldGroup, Sheet, Switch, inputClass, inputStyle } from "@/components/ui";
import { WEEKDAYS, daysLabel, everyLabel, useWellness } from "@/lib/tasks/wellness";

const WATER = "#0ea5e9";
const SLEEP = "#6366f1";
const SUMMARY = "#f59e0b";
const EVERY = [60, 90, 120, 180];
const PREP = [
  { min: 0, label: "Не надо" },
  { min: 15, label: "15 мин" },
  { min: 30, label: "30 мин" },
  { min: 60, label: "1 ч" },
];

/**
 * «Здоровье» в настройках задач: вода и сон. Строка — переключатель и
 * короткая сводка; тап по строке открывает подробности.
 */
export function WellnessSettings() {
  const { settings, problem, save } = useWellness();
  const [push] = usePushState();
  const [open, setOpen] = useState<"water" | "sleep" | "summary" | null>(null);
  if (!settings) return null;

  const anyOn = settings.water_on || settings.sleep_on || settings.summary_on;

  return (
    <>
      <SettingsHeading>Утренняя сводка</SettingsHeading>
      <div className="mb-4 overflow-hidden rounded-2xl" style={{ background: "var(--surface)" }}>
        <Row
          icon="sun"
          color={SUMMARY}
          title="Сводка на день"
          hint={
            settings.summary_on
              ? `В ${settings.summary_at} — сколько задач и что пропущено`
              : "Утром пуш: сколько задач на сегодня, первая по времени"
          }
          on={settings.summary_on}
          onToggle={(on) => {
            void save({ summary_on: on });
            if (on) setOpen("summary");
          }}
          onOpen={() => setOpen("summary")}
        />
      </div>

      <SettingsHeading>Здоровье</SettingsHeading>
      <div className="mb-1 overflow-hidden rounded-2xl" style={{ background: "var(--surface)" }}>
        <Row
          icon="glass"
          color={WATER}
          title="Вода"
          hint={
            settings.water_on
              ? `${settings.water_from}–${settings.water_to}, ${everyLabel(settings.water_every_min)} · цель ${settings.water_goal}`
              : "Напоминать пить воду и считать стаканы"
          }
          on={settings.water_on}
          onToggle={(on) => {
            void save({ water_on: on });
            if (on) setOpen("water");
          }}
          onOpen={() => setOpen("water")}
        />
        <Row
          icon="moon"
          color={SLEEP}
          title="Сон"
          hint={
            settings.sleep_on
              ? `Отбой в ${settings.sleep_at}, ${daysLabel(settings.sleep_days)}${
                  settings.sleep_prep_min ? ` · за ${settings.sleep_prep_min} мин` : ""
                }`
              : "Напоминать вовремя ложиться спать"
          }
          on={settings.sleep_on}
          onToggle={(on) => {
            void save({ sleep_on: on });
            if (on) setOpen("sleep");
          }}
          onOpen={() => setOpen("sleep")}
          divided
        />
      </div>
      <p className="mb-4 px-1 text-[0.6875rem] leading-snug" style={{ color: problem ? "var(--danger)" : "var(--muted)" }}>
        {problem ??
          (anyOn && push !== "on"
            ? "Чтобы напоминания приходили, включите уведомления в разделе «Напоминания» выше."
            : "Напоминания приходят пушем, даже когда приложение закрыто.")}
      </p>

      <Sheet
        open={open === "summary"}
        title="Утренняя сводка"
        onClose={() => setOpen(null)}
        footer={<Button onClick={() => setOpen(null)}>Готово</Button>}
      >
        <p className="mb-3 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Каждое утро пришлю пуш: «Доброе утро! Сегодня 5 задач. Первая в 10:00 — позвонить в банк.
          Пропущено: 2».
        </p>
        <Field label="Во сколько">
          <input type="time" className={inputClass} style={inputStyle} value={settings.summary_at}
            onChange={(e) => e.target.value && void save({ summary_at: e.target.value })} />
        </Field>
      </Sheet>

      <Sheet open={open === "water"} title="Вода" onClose={() => setOpen(null)} footer={<Button onClick={() => setOpen(null)}>Готово</Button>}>
        <p className="mb-3 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Напомню выпить воды в этот промежуток. Отметили стакан на экране «Сегодня» — следующее
          напоминание сдвинется. Выполнили цель — до завтра не беспокою.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="С">
            <input type="time" className={inputClass} style={inputStyle} value={settings.water_from}
              onChange={(e) => e.target.value && void save({ water_from: e.target.value })} />
          </Field>
          <Field label="До">
            <input type="time" className={inputClass} style={inputStyle} value={settings.water_to}
              onChange={(e) => e.target.value && void save({ water_to: e.target.value })} />
          </Field>
        </div>
        <FieldGroup label="Как часто">
          <Chips
            options={EVERY.map((m) => ({ value: m, label: everyLabel(m).replace("каждые ", "") }))}
            value={settings.water_every_min}
            color={WATER}
            onChange={(m) => void save({ water_every_min: m })}
          />
        </FieldGroup>
        <FieldGroup label="Цель на день">
          <div className="flex items-center gap-3">
            <Step onClick={() => void save({ water_goal: Math.max(1, settings.water_goal - 1) })}>−</Step>
            <span className="min-w-[7rem] text-center text-base font-semibold tabular-nums">
              {settings.water_goal} {plural(settings.water_goal, "стакан", "стакана", "стаканов")}
            </span>
            <Step onClick={() => void save({ water_goal: Math.min(30, settings.water_goal + 1) })}>+</Step>
          </div>
          <p className="mt-1.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            Обычно советуют 6–8 стаканов по 250 мл
          </p>
        </FieldGroup>
      </Sheet>

      <Sheet open={open === "sleep"} title="Сон" onClose={() => setOpen(null)} footer={<Button onClick={() => setOpen(null)}>Готово</Button>}>
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

function Row({
  icon,
  color,
  title,
  hint,
  on,
  onToggle,
  onOpen,
  divided,
}: {
  icon: string;
  color: string;
  title: string;
  hint: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  onOpen: () => void;
  divided?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="flex cursor-pointer items-center gap-3 px-4 py-3"
      style={{ borderTop: divided ? "1px solid var(--border)" : undefined }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: color }}>
        <Icon name={icon} size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem]">{title}</span>
        <span className="mt-0.5 block truncate text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
      </span>
      <Switch checked={on} onChange={onToggle} label={title} />
    </div>
  );
}

function Chips<T extends number>({
  options,
  value,
  color,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  color: string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className="rounded-full px-3.5 py-2 text-sm transition active:scale-95"
          style={{ background: value === o.value ? color : "var(--surface-2)", color: value === o.value ? "#fff" : "inherit" }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Step({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full text-xl transition active:scale-90"
      style={{ background: "var(--surface-2)" }}
    >
      {children}
    </button>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
