"use client";

import { useMemo, useState } from "react";
import { addDays, today } from "@/lib/tasks/dates";
import { Icon } from "@/lib/icons";
import { MOODS, PHASE_COLOR, SYMPTOMS, cycleInfo, type Phase } from "@/lib/fem/cycle";
import { range, short } from "@/lib/fem/format";
import { chanceOf } from "@/lib/fem/phrases";
import { Sheet, Switch } from "@/components/ui";
import { useFem } from "./DataProvider";
import { FemHeader } from "./Shell";
import { CycleRing, DayHero, plural } from "./parts";

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
    tips: ["Высокая вероятность беременности — учитывайте это"],
  },
  ovulation: {
    title: "Овуляция",
    about: "Середина цикла: яйцеклетка готова к оплодотворению. Пик энергии и уверенности.",
    tips: ["Самый вероятный день для зачатия"],
  },
  luteal: {
    title: "Перед месячными",
    about: "Организм готовится к новому циклу. Возможны ПМС: усталость, раздражительность, тяга к сладкому.",
    tips: ["Возможны ПМС, усталость и перепады настроения", "Чуть больше внимания и заботы", "Что-нибудь вкусное к чаю точно не помешает"],
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
  const { partner, leavePartner, setPartnerRemind } = useFem();
  const now = today();
  const [confirm, setConfirm] = useState(false);
  const [sheet, setSheet] = useState<"day" | "tips" | "chance" | "mood" | null>(null);
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
  const chance = info.phase ? chanceOf(info.phase) : null;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-16">
      <FemHeader title={`Цикл: ${name}`} sub="Партнёрский режим" />

      {info.phase ? <DayHero phase={info.phase} day={now} who="partner" /> : null}

      {phase && info.phase ? (
        <>
          <p className="mb-2 px-1 text-[0.9375rem] font-semibold">Сегодня для вас</p>
          {/* Лента карточек во всю ширину: листается пальцем, край
              следующей карточки подсказывает, что там есть ещё. */}
          <div className="-mx-4 mb-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <StripCard
              bg="linear-gradient(150deg, #f472b6, #a855f7)"
              icon="calendar"
              label="Её день"
              value={`День ${info.cycleDay}`}
              caption={phase.title}
              onClick={() => setSheet("day")}
              index={0}
            />
            <StripCard
              bg="linear-gradient(150deg, #c084fc, #6366f1)"
              icon="heart"
              label="Как поддержать"
              value={`${phase.tips.length} ${plural(phase.tips.length, "совет", "совета", "советов")}`}
              caption="на сегодня"
              onClick={() => setSheet("tips")}
              index={1}
            />
            {chance ? (
              <StripCard
                bg="linear-gradient(150deg, #2dd4bf, #0284c7)"
                icon="baby"
                label="Шанс беременности"
                value={chance.label}
                caption="по прогнозу"
                onClick={() => setSheet("chance")}
                index={2}
              />
            ) : null}
            {sharesToday ? (
              <StripCard
                bg="linear-gradient(150deg, #fdba74, #f43f5e)"
                icon="flower"
                label="Самочувствие"
                value={mood ? `${mood.emoji} ${mood.label}` : symptoms.length ? `${symptoms[0]!.emoji} ${symptoms[0]!.label}` : "Не отмечено"}
                caption={symptoms.length > (mood ? 0 : 1) ? `и ещё ${symptoms.length - (mood ? 0 : 1)}` : "сегодня"}
                onClick={() => setSheet("mood")}
                index={3}
              />
            ) : null}
          </div>
        </>
      ) : null}

      <div className="fem-card rounded-[28px] px-4 pb-5 pt-6">
        {info.lastStart ? (
          <CycleRing info={info} size={220} />
        ) : (
          <p className="py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
            {name} ещё не отметила месячные — прогноз появится после первой отметки
          </p>
        )}
        {phase && info.phase ? (
          <p className="mt-3 flex items-center justify-center gap-2 text-[0.8125rem] font-medium">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: PHASE_COLOR[info.phase] }} />
            {phase.title}
          </p>
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

      <Sheet
        open={sheet !== null}
        title={
          sheet === "day"
            ? `${info.cycleDay}-й день цикла`
            : sheet === "tips"
              ? "Как поддержать"
              : sheet === "chance"
                ? "Шанс беременности"
                : "Самочувствие сегодня"
        }
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
          {sheet === "tips" && phase ? (
            <ul className="space-y-2.5">
              {phase.tips.map((t) => (
                <li key={t} className="flex gap-2.5 rounded-2xl px-3.5 py-3" style={{ background: "var(--surface-2)" }}>
                  <Icon name="heart" size={16} className="mt-0.5 shrink-0" style={{ color: "#ec4899" }} />
                  {t}
                </li>
              ))}
            </ul>
          ) : null}
          {sheet === "chance" && chance ? (
            <>
              <div className="flex gap-1.5">
                {[0, 1, 2, 3].map((n) => (
                  <span
                    key={n}
                    className="h-2 flex-1 rounded-full"
                    style={{ background: n <= chance.level ? "#14b8a6" : "var(--surface-2)" }}
                  />
                ))}
              </div>
              <p className="mt-2 font-semibold">{chance.label}</p>
              <p className="mt-1.5 text-sm" style={{ color: "var(--muted)" }}>
                {chance.level >= 2
                  ? "Сейчас фертильные дни — вероятность беременности высокая."
                  : chance.level === 1
                    ? "При задержке надёжнее всего — тест на беременность."
                    : "Вне фертильного окна вероятность ниже, но не нулевая."}{" "}
                Это оценка по прошлым циклам, а не способ предохранения.
              </p>
            </>
          ) : null}
          {sheet === "mood" ? (
            mood || symptoms.length ? (
              <div className="flex flex-wrap gap-1.5">
                {mood ? (
                  <Tag>
                    {mood.emoji} {mood.label}
                  </Tag>
                ) : null}
                {symptoms.map((s) => (
                  <Tag key={s!.value}>
                    {s!.emoji} {s!.label}
                  </Tag>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--muted)" }}>{name} сегодня ещё ничего не отметила.</p>
            )
          ) : null}
        </div>
      </Sheet>
    </div>
  );
}

/** Карточка ленты «Сегодня для вас»: яркая, с кружком Dots в углу. */
function StripCard({
  bg,
  icon,
  label,
  value,
  caption,
  onClick,
  index,
}: {
  bg: string;
  icon: string;
  label: string;
  value: string;
  caption: string;
  onClick: () => void;
  index: number;
}) {
  return (
    <button
      onClick={onClick}
      className="animate-lift relative flex h-40 w-36 shrink-0 snap-start flex-col overflow-hidden rounded-3xl p-3.5 text-left text-white transition active:scale-95"
      style={{ background: bg, boxShadow: "0 12px 24px -14px rgba(124,58,237,0.6)", animationDelay: `${120 + index * 60}ms` }}
    >
      <span className="pointer-events-none absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-white/15" />
      <span className="pointer-events-none absolute -bottom-2 right-10 h-8 w-8 rounded-full bg-white/10" />
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
        <Icon name={icon} size={16} />
      </span>
      <span className="mt-auto text-[0.6875rem] font-medium opacity-85">{label}</span>
      <span className="mt-0.5 text-[1.0625rem] font-bold leading-tight">{value}</span>
      <span className="mt-0.5 text-[0.6875rem] opacity-80">{caption}</span>
    </button>
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
