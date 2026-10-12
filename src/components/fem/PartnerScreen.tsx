"use client";

import { useMemo, useState } from "react";
import { addDays, today } from "@/lib/tasks/dates";
import { MOODS, PHASE_COLOR, SYMPTOMS, cycleInfo, type Phase } from "@/lib/fem/cycle";
import { range, short } from "@/lib/fem/format";
import { Switch } from "@/components/ui";
import { useFem } from "./DataProvider";
import { FemHeader } from "./Shell";
import { CycleRing, plural } from "./parts";

/** Фаза — глазами партнёра: что происходит и как поддержать. */
const PARTNER_PHASE: Record<Phase, { title: string; tips: string[] }> = {
  period: {
    title: "Месячные",
    tips: ["Тёплый чай и грелка будут кстати", "Возьмите на себя часть дел по дому", "Самочувствие может быть неважным — побольше терпения"],
  },
  follicular: {
    title: "Энергии становится больше",
    tips: ["Хорошее время для совместных планов", "Предложите прогулку, спорт или что-то новое"],
  },
  fertile: {
    title: "Фертильное окно",
    tips: ["Высокая вероятность беременности — учитывайте это"],
  },
  ovulation: {
    title: "Овуляция",
    tips: ["Самый вероятный день для зачатия"],
  },
  luteal: {
    title: "Перед месячными",
    tips: ["Возможны ПМС, усталость и перепады настроения", "Чуть больше внимания и заботы", "Что-нибудь вкусное к чаю точно не помешает"],
  },
  late: {
    title: "Задержка",
    tips: ["Цикл может сдвигаться из-за стресса, сна и болезни", "Поддержите и не торопите с выводами"],
  },
};

/**
 * Партнёрский режим: цикл девушки только для чтения. Видно ровно то, чем
 * она поделилась; отключиться можно в любой момент.
 */
export function PartnerScreen() {
  const { partner, leavePartner, setPartnerRemind } = useFem();
  const now = today();
  const [confirm, setConfirm] = useState(false);
  const info = useMemo(
    () =>
      partner
        ? cycleInfo(partner.periods, { cycle_length: partner.cycle_length, period_length: partner.period_length }, now)
        : null,
    [partner, now],
  );
  if (!partner || !info) return null;
  const name = partner.owner_name;
  const phase = info.phase ? PARTNER_PHASE[info.phase] : null;
  const shift = info.fertileEnd && info.fertileEnd < now ? info.cycleLength : 0;
  const mood = partner.today?.mood ? MOODS.find((m) => m.value === partner.today?.mood) : null;
  const symptoms = (partner.today?.symptoms ?? []).map((v) => SYMPTOMS.find((s) => s.value === v)).filter(Boolean);
  const sharesToday = partner.share_mood || partner.share_symptoms;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16">
      <FemHeader title={`Цикл: ${name}`} sub="Партнёрский режим" />

      <div className="fem-card rounded-[28px] px-4 pb-5 pt-6">
        {info.lastStart ? (
          <CycleRing info={info} />
        ) : (
          <p className="py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
            {name} ещё не отметила месячные — прогноз появится после первой отметки
          </p>
        )}
        {phase && info.phase ? (
          <div
            className="mt-4 rounded-2xl px-4 py-3"
            style={{ background: `color-mix(in srgb, ${PHASE_COLOR[info.phase]} 16%, var(--surface))` }}
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: PHASE_COLOR[info.phase] }} />
              {phase.title}
            </p>
            <ul className="mt-1.5 space-y-1 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
              {phase.tips.map((t) => (
                <li key={t}>· {t}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {info.nextStart ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Fact
            color={PHASE_COLOR.period}
            label="Месячные"
            value={info.current ? "сейчас" : info.late > 0 ? "задержка" : `~${short(info.nextStart)}`}
            hint={
              info.current
                ? `${info.cycleDay}-й день`
                : info.late > 0
                  ? `${info.late} ${plural(info.late, "день", "дня", "дней")}`
                  : `через ${info.daysToNext} ${plural(info.daysToNext ?? 0, "день", "дня", "дней")}`
            }
          />
          <Fact
            color={PHASE_COLOR.fertile}
            label="Фертильное окно"
            value={range(addDays(info.fertileStart!, shift), addDays(info.fertileEnd!, shift))}
            hint={`овуляция ~${short(addDays(info.ovulation!, shift))}`}
          />
        </div>
      ) : null}

      {sharesToday ? (
        <div className="fem-card mt-3 rounded-3xl p-4">
          <p className="text-[0.9375rem] font-semibold">Самочувствие сегодня</p>
          {mood || symptoms.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {mood ? <Tag>{mood.emoji} {mood.label}</Tag> : null}
              {symptoms.map((s) => (
                <Tag key={s!.value}>
                  {s!.emoji} {s!.label}
                </Tag>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
              Пока ничего не отмечено
            </p>
          )}
        </div>
      ) : null}

      <div className="fem-card mt-3 overflow-hidden rounded-3xl">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem]">Напоминать мне</span>
            <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
              За 2 дня до месячных — чтобы быть внимательнее
            </span>
          </span>
          <Switch checked={partner.remind} onChange={(v) => void setPartnerRemind(v)} label="Напоминать мне" />
        </div>
      </div>

      <button
        onClick={async () => {
          if (!confirm) {
            setConfirm(true);
            return;
          }
          await leavePartner();
        }}
        className="mt-4 w-full rounded-2xl py-3 text-sm font-medium"
        style={{ color: confirm ? "#fff" : "var(--danger)", background: confirm ? "var(--danger)" : "transparent" }}
      >
        {confirm ? "Нажмите ещё раз — отключиться" : "Отключиться от цикла"}
      </button>
      <p className="mt-2 px-4 text-center text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
        Вы видите только то, чем {name} поделилась, и ничего не можете изменить. Прогноз — оценка, а не медицинский совет.
      </p>
    </div>
  );
}

function Fact({ color, label, value, hint }: { color: string; label: string; value: string; hint: string }) {
  return (
    <div className="fem-card rounded-2xl px-3.5 py-3">
      <span className="flex items-center gap-1.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="mt-0.5 block text-base font-semibold">{value}</span>
      <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        {hint}
      </span>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full px-3 py-1.5 text-[0.8125rem]" style={{ background: "var(--surface-2)" }}>
      {children}
    </span>
  );
}
