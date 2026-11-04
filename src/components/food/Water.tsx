"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";
import { usePushState } from "@/components/PushSettings";
import { SettingsHeading } from "@/components/SettingsHeading";
import { Button, Field, FieldGroup, Sheet, inputClass, inputStyle } from "@/components/ui";
import { Chips, EVERY, Row, Step, plural } from "@/components/tasks/WellnessSettings";
import { everyLabel, useWellness } from "@/lib/tasks/wellness";

const WATER = "#0ea5e9";

/**
 * Вода в Yumdots — рядом с едой. Данные те же, что были в Todots
 * (wellness_settings, water_log): переехал только экран.
 * Стаканы — капельками: сколько выпито и сколько осталось, видно сразу.
 */
export function WaterCard() {
  const { settings, glasses, problem, addGlass } = useWellness();
  if (!settings) return null;
  const goal = settings.water_goal;
  const done = glasses >= goal;
  const ml = glasses * 250;

  return (
    <section className="food-card mt-3 rounded-3xl p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: done ? "#22c55e" : WATER }}>
          <Icon name={done ? "check" : "glass"} size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-semibold">
            Вода{" "}
            <span className="tabular-nums" style={{ color: done ? "#16a34a" : WATER }}>
              {glasses}
              <span style={{ color: "var(--muted)" }}>/{goal}</span>
            </span>
          </span>
          <span className="block text-[0.6875rem] tabular-nums" style={{ color: "var(--muted)" }}>
            {done ? `Цель выполнена · ${(ml / 1000).toLocaleString("ru-RU")} л` : `${(ml / 1000).toLocaleString("ru-RU")} л · стакан 250 мл`}
          </span>
        </span>
        {glasses > 0 ? (
          <button
            onClick={() => void addGlass(-1)}
            aria-label="Убрать стакан"
            className="flex h-9 w-9 items-center justify-center rounded-full text-lg leading-none transition active:scale-90"
            style={{ background: "var(--surface-2)", color: "var(--muted)" }}
          >
            −
          </button>
        ) : null}
        <button
          onClick={() => void addGlass(1)}
          aria-label="Выпил стакан"
          className="flex h-10 w-10 items-center justify-center rounded-full text-white transition active:scale-90"
          style={{ background: WATER, boxShadow: "0 6px 16px -6px rgba(14,165,233,.7)" }}
        >
          <Icon name="plus" size={20} />
        </button>
      </div>
      {/* Капли: закрашенные — выпито. Сверх цели не рисуем больше 12. */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {Array.from({ length: Math.min(Math.max(goal, glasses), 12) }, (_, i) => (
          <Icon
            key={i}
            name="water"
            size={18}
            style={{ color: i < glasses ? (done ? "#22c55e" : WATER) : "var(--border)", transition: "color 200ms" }}
          />
        ))}
      </div>
      {problem ? (
        <p className="mt-1.5 text-[0.6875rem]" style={{ color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}
    </section>
  );
}

/** Настройки воды: напоминания, промежуток, как часто и цель на день. */
export function WaterSettings() {
  const { settings, problem, save } = useWellness();
  const [push] = usePushState();
  const [open, setOpen] = useState(false);
  if (!settings) return null;

  return (
    <>
      <SettingsHeading>Вода</SettingsHeading>
      <div className="mb-1 overflow-hidden rounded-2xl" style={{ background: "var(--surface)" }}>
        <Row
          icon="glass"
          color={WATER}
          title="Напоминать пить воду"
          hint={
            settings.water_on
              ? `${settings.water_from}–${settings.water_to}, ${everyLabel(settings.water_every_min)} · цель ${settings.water_goal}`
              : `Цель ${settings.water_goal} ${plural(settings.water_goal, "стакан", "стакана", "стаканов")} · без напоминаний`
          }
          on={settings.water_on}
          onToggle={(on) => {
            void save({ water_on: on });
            if (on) setOpen(true);
          }}
          onOpen={() => setOpen(true)}
        />
      </div>
      <p className="mb-4 px-1 text-[0.6875rem] leading-snug" style={{ color: problem ? "var(--danger)" : "var(--muted)" }}>
        {problem ??
          (settings.water_on && push !== "on"
            ? "Чтобы напоминания приходили, включите уведомления ниже."
            : "Стаканы отмечаются на экране «Сегодня». Напоминания приходят пушем, даже когда приложение закрыто.")}
      </p>

      <Sheet open={open} title="Вода" onClose={() => setOpen(false)} footer={<Button onClick={() => setOpen(false)}>Готово</Button>}>
        <p className="mb-3 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Напомню выпить воды в этот промежуток. Отметили стакан — следующее напоминание сдвинется. Выполнили цель — до завтра не беспокою.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="С">
            <input type="time" className={inputClass} style={inputStyle} value={settings.water_from} onChange={(e) => e.target.value && void save({ water_from: e.target.value })} />
          </Field>
          <Field label="До">
            <input type="time" className={inputClass} style={inputStyle} value={settings.water_to} onChange={(e) => e.target.value && void save({ water_to: e.target.value })} />
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
    </>
  );
}
