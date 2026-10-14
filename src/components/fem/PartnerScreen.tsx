"use client";

import { useMemo, useState } from "react";
import { addDays, today } from "@/lib/tasks/dates";
import { Icon } from "@/lib/icons";
import { MOODS, PHASE_COLOR, SYMPTOMS, cycleInfo, type Phase } from "@/lib/fem/cycle";
import { range, short } from "@/lib/fem/format";
import { Sheet, Switch } from "@/components/ui";
import { useFem } from "./DataProvider";
import { FemHeader } from "./Shell";
import { DayHero, plural } from "./parts";
import { CycleDial, DialStyleRow, flowerStage } from "./CycleDial";
import { PartnerTogether } from "./Together";
import { PartnerCalendar } from "./PartnerCalendar";
import { ForecastCard } from "./Insights";
import { PartnerToday } from "./PartnerToday";
import { THEMES } from "@/lib/look";
import { TEXT_SCALES } from "@/lib/textScale";

/** Фаза — глазами партнёра: что происходит и как поддержать. */
const PARTNER_PHASE: Record<Phase, { title: string; about: string; tips: string[] }> = {
  period: {
    title: "Месячные",
    about: "Идут несколько дней. Бывают боли внизу живота, слабость, хочется тепла и покоя.",
    tips: ["Тёплый чай и грелка будут кстати", "Возьмите на себя часть дел по дому", "Самочувствие может быть неважным — побольше терпения"],
  },
  follicular: {
    title: "Энергии становится больше",
    about: "После месячных сил и настроения обычно прибавляется с каждым днём.",
    tips: ["Хорошее время для совместных планов", "Предложите прогулку, спорт или что-то новое"],
  },
  fertile: {
    title: "Фертильное окно",
    about: "Несколько дней вокруг овуляции, когда забеременеть проще всего. Часто это время подъёма и хорошего самочувствия.",
    tips: [
      "Она на подъёме — отличное время для свидания",
      "Комплименты и внимание сейчас особенно приятны",
      "Предложите что-то активное: прогулку, танцы, поездку",
    ],
  },
  ovulation: {
    title: "Овуляция",
    about: "Середина цикла: яйцеклетка готова к оплодотворению. Пик энергии и уверенности.",
    tips: [
      "Пик энергии — проведите день вместе",
      "Скажите, как она вам нравится, — она почувствует",
    ],
  },
  luteal: {
    title: "Перед месячными",
    about: "Организм готовится к новому циклу. Возможны ПМС: усталость, раздражительность, тяга к сладкому.",
    tips: ["Возможны ПМС, усталость и перепады настроения", "Чуть больше внимания и заботы", "Что-нибудь вкусное к чаю точно не помешает"],
  },
  pregnant: {
    title: "Особенное время",
    about: "Прогноз цикла сейчас на паузе.",
    tips: ["Чуть больше заботы и внимания"],
  },
  protected: {
    title: "Ровный период",
    about: "Она на гормональной контрацепции: овуляции нет, гормоны держатся ровно, кровотечение — по схеме.",
    tips: ["Простое «как ты?» — уже забота", "Придумайте что-то приятное вместе"],
  },
  late: {
    title: "Задержка",
    about: "Месячные не начались в ожидаемый день. Небольшие сдвиги — обычное дело.",
    tips: ["Цикл может сдвигаться из-за стресса, сна и болезни", "Поддержите и не торопите с выводами"],
  },
};

/**
 * Партнёрский режим: цикл девушки только для чтения. Видно ровно то, чем
 * она поделилась; отключиться можно в любой момент.
 */
export function PartnerScreen() {
  const { partner, leavePartner, setPartnerRemind, profile, saveProfile } = useFem();
  const now = today();
  const [confirm, setConfirm] = useState(false);
  const [prefs, setPrefs] = useState(false);
  const [sheet, setSheet] = useState<"day" | null>(null);
  const info = useMemo(
    () =>
      partner
        ? cycleInfo(
            partner.periods,
            { cycle_length: partner.cycle_length, period_length: partner.period_length },
            now,
            // Способ контрацепции партнёру не виден — только «гормональная или нет».
            { lhDays: partner.lh_days ?? [], mucusDays: partner.mucus_days ?? [], method: partner.hormonal ? "pop" : "none" },
          )
        : null,
    [partner, now],
  );
  if (!partner || !info) return null;
  const name = partner.owner_name;
  const phase = info.phase ? PARTNER_PHASE[info.phase] : null;
  const shift = info.fertileEnd && info.fertileEnd < now ? info.cycleLength : 0;
  const mood = partner.today?.mood ? MOODS.find((m) => m.value === partner.today?.mood) : null;
  const symptoms = (partner.today?.symptoms ?? []).map((v) => SYMPTOMS.find((s) => s.value === v)).filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16">
      <FemHeader
        title={`Цикл: ${name}`}
        sub="Партнёрский режим"
        action={
          <button
            onClick={() => setPrefs(true)}
            aria-label="Настройки"
            className="flex h-10 w-10 items-center justify-center rounded-full transition active:scale-90"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            <Icon name="gear" size={19} />
          </button>
        }
      />

      {info.phase && !partner.paused ? <DayHero phase={info.phase} day={now} who="partner" goal={partner.goal} /> : null}

      <PartnerTogether name={name} status={partner.share_status ? (partner.today?.status ?? null) : null} />

      {partner.paused ? (
        // Беременность: прогноз на паузе. Причину не называем — она скажет сама.
        <div className="fem-card rounded-3xl px-4 py-5 text-center">
          <p className="text-2xl">🌸</p>
          <p className="mt-1 text-[0.9375rem] font-semibold">Прогноз цикла на паузе</p>
          <p className="mt-1 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
            {name} поставила прогноз на паузу. Просьбы и статус дня по-прежнему приходят сюда.
          </p>
        </div>
      ) : (
      <>
      {partner.goal === "conceive" ? (
        <p className="fem-card mb-4 rounded-3xl px-4 py-3 text-[0.8125rem] leading-snug">
          💗 <b>Вы планируете беременность.</b> Лучшие дни подсвечены ниже — напомним, когда они начнутся.
        </p>
      ) : null}

      {phase && info.phase ? (
        <PartnerToday
          name={name}
          info={info}
          mood={partner.share_mood ? (mood ?? null) : null}
          symptoms={partner.share_symptoms ? symptoms.filter((x) => !!x).map((x) => x!) : []}
          goal={partner.goal ?? null}
          onAbout={() => setSheet("day")}
        />
      ) : null}

      <div className="fem-card rounded-[28px] px-4 pb-5 pt-6">
        {info.lastStart ? (
          <CycleDial info={info} size={270} />
        ) : (
          <p className="py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
            {name} ещё не отметила месячные — прогноз появится после первой отметки
          </p>
        )}
        {phase && info.phase ? (
          <p className="mt-3 flex items-center justify-center gap-2 text-[0.8125rem] font-medium">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: PHASE_COLOR[info.phase] }} />
            {flowerStage(info, profile?.fem_ring ?? "flower") ? `${flowerStage(info, profile?.fem_ring ?? "flower")} · ` : ""}
            {phase.title}
          </p>
        ) : null}
      </div>

      {info.nextStart ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Fact
            color={PHASE_COLOR.period}
            label="Месячные"
            value={
              info.current
                ? "сейчас"
                : info.late > 0
                  ? "задержка"
                  : info.nextRange
                    ? range(info.nextRange[0], info.nextRange[1])
                    : `~${short(info.nextStart)}`
            }
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
            label={partner.goal === "conceive" ? "Лучшие дни" : "Фертильное окно"}
            value={range(addDays(info.fertileStart!, shift), addDays(info.fertileEnd!, shift))}
            hint={`овуляция ~${short(addDays(info.ovulation!, shift))}`}
          />
        </div>
      ) : null}

      <ForecastCard periods={partner.periods} logs={partner.symptom_days ?? []} info={info} who="partner" name={name} />

      <PartnerCalendar info={info} />
      </>
      )}

      <p className="mt-5 px-4 text-center text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
        Вы видите только то, чем {name} поделилась, и ничего не можете изменить. Прогноз — оценка, а не медицинский совет.
      </p>

      {/* Настройки партнёра — в шапке, чтобы главный экран оставался чистым. */}
      <Sheet open={prefs} title="Настройки" onClose={() => { setPrefs(false); setConfirm(false); }}>
        <div className="pb-3">
        <div className="overflow-hidden rounded-2xl" style={{ background: "var(--surface-2)" }}>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem]">Напоминать мне</span>
              <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
                За 2 дня до месячных — чтобы быть внимательнее
                {partner.pill_nudge ? ". И если она забудет таблетку" : ""}
              </span>
            </span>
            <Switch checked={partner.remind} onChange={(v) => void setPartnerRemind(v)} label="Напоминать мне" />
          </div>
          <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
            <DialStyleRow />
          </div>
        </div>

        <p className="mb-1.5 mt-4 px-1 text-xs font-semibold" style={{ color: "var(--muted)" }}>
          Оформление — общее для всех приложений Dots
        </p>
        <div className="space-y-3 rounded-2xl px-4 py-3.5" style={{ background: "var(--surface-2)" }}>
          <div>
            <p className="mb-2 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
              Тема
            </p>
            <div className="flex gap-2">
              {THEMES.map(({ id, label }) => (
                <LookChoice key={id} on={(profile?.theme ?? "system") === id} onClick={() => void saveProfile({ theme: id })}>
                  {label}
                </LookChoice>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
              Размер шрифта
            </p>
            <div className="flex gap-2">
              {TEXT_SCALES.map((item) => (
                <LookChoice
                  key={item.id}
                  on={(profile?.text_scale ?? "medium") === item.id}
                  onClick={() => void saveProfile({ text_scale: item.id })}
                  fontSize={`${0.875 * item.factor}rem`}
                >
                  {item.label}
                </LookChoice>
              ))}
            </div>
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
          className="mt-3 w-full rounded-2xl py-3 text-sm font-medium"
          style={{ color: confirm ? "#fff" : "var(--danger)", background: confirm ? "var(--danger)" : "transparent" }}
        >
          {confirm ? "Нажмите ещё раз — отключиться" : "Отключиться от цикла"}
        </button>
        </div>
      </Sheet>

      <Sheet
        open={sheet !== null}
        title={`${info.cycleDay}-й день цикла`}
        onClose={() => setSheet(null)}
      >
        <div className="pb-3 text-[0.9375rem] leading-snug">
          {sheet === "day" && phase && info.phase ? (
            <>
              <p className="flex items-center gap-2 font-semibold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: PHASE_COLOR[info.phase] }} />
                {phase.title}
              </p>
              <p className="mt-1.5" style={{ color: "var(--muted)" }}>
                {phase.about}
              </p>
              {info.nextStart ? (
                <p className="mt-3 text-sm">
                  {info.current
                    ? `Месячные идут ${info.cycleDay}-й день.`
                    : info.late > 0
                      ? `Месячные задерживаются на ${info.late} ${plural(info.late, "день", "дня", "дней")}.`
                      : `Следующие месячные — примерно ${short(info.nextStart)}.`}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}

function Fact({ color, label, value, hint }: { color: string; label: string; value: string; hint: string }) {
  return (
    <div
      className="fem-card relative overflow-hidden rounded-2xl px-3.5 py-3"
      style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${color} 14%, var(--surface)) 0%, var(--surface) 70%)` }}
    >
      {/* Кружок Dots в углу — в цвет карточки. */}
      <span
        className="pointer-events-none absolute -right-5 -top-5 h-16 w-16 rounded-full"
        style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}
      />
      <span className="relative flex items-center gap-1.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 25%, transparent)` }} />
        {label}
      </span>
      <span className="relative mt-1 block text-[1.0625rem] font-bold tracking-tight">{value}</span>
      <span className="relative block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        {hint}
      </span>
    </div>
  );
}


/** Кнопка выбора темы или размера шрифта — как в настройках у неё. */
function LookChoice({ on, onClick, fontSize, children }: { on: boolean; onClick: () => void; fontSize?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="min-w-0 flex-1 rounded-xl px-1.5 py-2.5 font-medium transition active:scale-95"
      style={{
        fontSize: fontSize ?? "0.875rem",
        background: on ? "var(--surface)" : "transparent",
        color: on ? "var(--accent)" : "var(--text)",
        border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
      }}
    >
      {children}
    </button>
  );
}
