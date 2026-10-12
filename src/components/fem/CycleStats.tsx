"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import { addDays, today } from "@/lib/tasks/dates";
import {
  FEM_GRADIENT,
  MOODS,
  PHASE_COLOR,
  SYMPTOMS,
  cycleInfo,
  daysBetween,
  signalsFrom,
  type FemPeriod,
} from "@/lib/fem/cycle";
import { reviewLastCycle } from "@/lib/fem/review";
import { short } from "@/lib/fem/format";
import { Sheet } from "@/components/ui";
import { useFem } from "./DataProvider";
import { plural } from "./parts";

const OK = "#14b8a6";
const WARN = "#f59e0b";

/** Значок «Норма» / «Не норма» — с цветом и словом, не только цветом. */
function Badge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-wide">
      <span className="flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ background: ok ? OK : WARN }}>
        {ok ? <Icon name="check" size={12} /> : "!"}
      </span>
      {text}
    </span>
  );
}

/**
 * «Мои циклы» — как во Flo: прошлый цикл, прошлые месячные и разброс,
 * у каждого — норма или нет, по нажатию ⓘ — что считается нормой (FIGO).
 */
export function MyCycles() {
  const { periods } = useFem();
  const [info, setInfo] = useState<string | null>(null);
  const list = useMemo(() => [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date)), [periods]);
  if (list.length < 2) return null;
  const prev = list[list.length - 2];
  const last = list[list.length - 1];
  const length = daysBetween(prev.start_date, last.start_date);
  const closed = [...list].reverse().find((p) => p.end_date && p.start_date < last.start_date) ?? (last.end_date ? last : null);
  const periodDays = closed ? daysBetween(closed.start_date, closed.end_date!) + 1 : null;
  const lengths: number[] = [];
  for (let i = 1; i < list.length; i++) {
    const g = daysBetween(list[i - 1].start_date, list[i].start_date);
    if (g >= 15 && g <= 60) lengths.push(g);
  }
  const recent = lengths.slice(-6);
  const spread = recent.length >= 2 ? Math.max(...recent) - Math.min(...recent) : null;

  const rows = [
    {
      key: "cycle",
      label: "Длина предыдущего цикла",
      value: `${length} ${plural(length, "день", "дня", "дней")}`,
      ok: length >= 24 && length <= 38,
      badge: length >= 24 && length <= 38 ? "Норма" : "Не норма",
      about: "Норма — от 24 до 38 дней, от первого дня одних месячных до первого дня следующих. Один выбившийся цикл бывает у всех; если повторяется — покажитесь врачу.",
    },
    ...(periodDays
      ? [
          {
            key: "period",
            label: "Длина предыдущих месячных",
            value: `${periodDays} ${plural(periodDays, "день", "дня", "дней")}`,
            ok: periodDays <= 8,
            badge: periodDays <= 8 ? "Норма" : "Не норма",
            about: "Норма — до 8 дней. Дольше, особенно с обильными выделениями, — повод обратиться к врачу.",
          },
        ]
      : []),
    ...(spread != null
      ? [
          {
            key: "spread",
            label: "Колебания длины цикла",
            value: `${Math.min(...recent)}–${Math.max(...recent)} дней`,
            ok: spread <= 9,
            badge: spread <= 9 ? "Регулярный" : "Нерегулярный",
            about: "Цикл считается регулярным, если самый короткий и самый длинный из последних отличаются не больше чем на 7–9 дней (FIGO).",
          },
        ]
      : []),
  ];

  return (
    <div className="fem-card mt-3 overflow-hidden rounded-3xl">
      <p className="px-4 pt-4 text-[0.9375rem] font-semibold">Мои циклы</p>
      {rows.map((r, i) => (
        <div key={r.key} className="px-4 py-3" style={{ borderTop: i ? "1px solid var(--border)" : undefined }}>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[0.75rem]" style={{ color: "var(--muted)" }}>
                {r.label}
                <button onClick={() => setInfo(info === r.key ? null : r.key)} aria-label="Что это значит" className="opacity-60">
                  <Icon name="question" size={14} />
                </button>
              </span>
              <span className="block text-[1.125rem] font-bold tabular-nums">{r.value}</span>
            </span>
            <Badge ok={r.ok} text={r.badge} />
          </div>
          {info === r.key ? (
            <p className="animate-lift mt-2 rounded-2xl px-3 py-2 text-[0.75rem] leading-snug" style={{ background: "var(--surface-2)" }}>
              {r.about}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Кружок дня в полоске цикла. */
function Dot({ color }: { color: string }) {
  return <span className="h-[9px] w-[9px] rounded-full" style={{ background: color }} />;
}

/**
 * История циклов: каждый — полоска кружков по дням. Красные — месячные,
 * бирюзовые — фертильные, тёмно-бирюзовый — овуляция, серые — остальное.
 * Нажатие — что было в этом цикле.
 */
export function CycleHistory() {
  const { periods, days, settings } = useFem();
  const now = today();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<{ from: string; to: string; title: string } | null>(null);
  const info = useMemo(() => cycleInfo(periods, settings!, now, signalsFrom(days, settings)), [periods, settings, days, now]);

  const cycles = useMemo(() => {
    const list = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const out: { from: string; to: string; length: number; current: boolean; period: FemPeriod }[] = [];
    for (let i = 0; i < list.length; i++) {
      const from = list[i].start_date;
      const next = list[i + 1]?.start_date;
      if (next) {
        const length = daysBetween(from, next);
        if (length >= 10 && length <= 90) out.push({ from, to: addDays(next, -1), length, current: false, period: list[i] });
      } else if (from <= now) {
        out.push({ from, to: now, length: daysBetween(from, now) + 1, current: true, period: list[i] });
      }
    }
    return out.reverse();
  }, [periods, now]);
  if (cycles.length === 0 || info.pregnancy) return null;
  const shown = all ? cycles : cycles.slice(0, 3);

  const colorOf = (c: (typeof cycles)[number], k: number) => {
    const d = addDays(c.from, k);
    const end = c.period.end_date ?? (c.current && info.current ? now : addDays(c.from, info.periodLength - 1));
    if (d <= end) return PHASE_COLOR.period;
    if (info.hormonal) return "var(--surface-2)";
    // Овуляция: у текущего — из прогноза, у прошлых — за «свою» вторую фазу до следующих.
    const ov = c.current ? info.ovulation : addDays(c.to, 1 - info.luteal);
    if (!ov) return "var(--surface-2)";
    if (d === ov) return OK;
    if (d >= addDays(ov, -5) && d <= addDays(ov, 1)) return PHASE_COLOR.fertile;
    return "var(--surface-2)";
  };

  return (
    <div className="fem-card mt-3 overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between px-4 pt-4">
        <p className="text-[0.9375rem] font-semibold">История циклов</p>
        {cycles.length > 3 ? (
          <button onClick={() => setAll(!all)} className="flex items-center gap-1 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            {all ? "Свернуть" : "Смотреть все"}
            <Icon name={all ? "chevron-down" : "chevron-right"} size={14} />
          </button>
        ) : null}
      </div>
      {shown.map((c, i) => {
        const title = c.current
          ? `Текущий цикл: ${c.length} ${plural(c.length, "день", "дня", "дней")}`
          : `${c.length} ${plural(c.length, "день", "дня", "дней")}`;
        return (
          <button
            key={c.from}
            onClick={() => setOpen({ from: c.from, to: c.to, title })}
            className="block w-full px-4 py-3 text-left"
            style={{ borderTop: i ? "1px solid var(--border)" : undefined }}
          >
            <span className="flex items-center justify-between">
              <span>
                <span className="block text-[0.9375rem] font-semibold">{title}</span>
                <span className="block text-[0.75rem]" style={{ color: "var(--muted)" }}>
                  {c.current ? `Начался ${short(c.from)}` : `${short(c.from)} – ${short(c.to)}`}
                </span>
              </span>
              <Icon name="chevron-right" size={16} className="opacity-30" />
            </span>
            <span className="mt-2 flex flex-wrap gap-[3px]">
              {Array.from({ length: c.length }, (_, k) => (
                <Dot key={k} color={colorOf(c, k)} />
              ))}
            </span>
          </button>
        );
      })}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        <span className="flex items-center gap-1"><Dot color={PHASE_COLOR.period} />Месячные</span>
        {info.hormonal ? null : (
          <>
            <span className="flex items-center gap-1"><Dot color={PHASE_COLOR.fertile} />Фертильные</span>
            <span className="flex items-center gap-1"><Dot color={OK} />Овуляция</span>
          </>
        )}
      </div>

      <Sheet open={!!open} title={open?.title ?? ""} onClose={() => setOpen(null)}>
        {open ? <CycleDetails from={open.from} to={open.to} /> : null}
      </Sheet>
    </div>
  );
}

/** Что было в цикле: частые симптомы, настроение, стресс, тесты. */
function CycleDetails({ from, to }: { from: string; to: string }) {
  const { days } = useFem();
  const inCycle = [...days.values()].filter((d) => d.day >= from && d.day <= to);
  const count = new Map<string, number>();
  for (const d of inCycle) for (const s of d.symptoms) if (s !== "ok") count.set(s, (count.get(s) ?? 0) + 1);
  const moods = new Map<string, number>();
  for (const d of inCycle) if (d.mood) moods.set(d.mood, (moods.get(d.mood) ?? 0) + 1);
  const stress = inCycle.filter((d) => d.tags.includes("o:stress")).length;
  const lh = inCycle.find((d) => d.lh === "pos");
  const rows = [
    ...[...count].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v, n]) => {
      const s = SYMPTOMS.find((x) => x.value === v);
      return `${s?.emoji ?? ""} ${s?.label ?? v} — ${n}`;
    }),
    ...[...moods].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, n]) => {
      const m = MOODS.find((x) => x.value === v);
      return `${m?.emoji ?? ""} ${m?.label ?? v} — ${n}`;
    }),
    ...(stress ? [`⚡ Стресс — ${stress}`] : []),
    ...(lh ? [`✅ Положительный тест на овуляцию — ${short(lh.day)}`] : []),
  ];
  return (
    <div className="space-y-2 pb-3">
      <p className="text-[0.8125rem]" style={{ color: "var(--muted)" }}>
        {short(from)} – {short(to)}
      </p>
      {rows.length ? (
        rows.map((r) => (
          <p key={r} className="rounded-2xl px-3.5 py-2.5 text-sm" style={{ background: "var(--surface-2)" }}>
            {r}
          </p>
        ))
      ) : (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          В этом цикле ничего не отмечено.
        </p>
      )}
    </div>
  );
}

/**
 * Динамика цикла: длина каждого цикла на полосе нормы (24–38). Выпавшие —
 * оранжевые с подписью «не норма». Во Flo это по подписке, у нас — так.
 */
export function CycleDynamics() {
  const { periods } = useFem();
  const points = useMemo(() => {
    const list = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
    const out: { from: string; length: number }[] = [];
    for (let i = 1; i < list.length; i++) {
      const length = daysBetween(list[i - 1].start_date, list[i].start_date);
      if (length >= 10 && length <= 90) out.push({ from: list[i - 1].start_date, length });
    }
    return out.slice(-8);
  }, [periods]);
  if (points.length < 2) return null;
  const W = 320;
  const H = 150;
  const lo = Math.min(20, ...points.map((p) => p.length)) - 2;
  const hi = Math.max(42, ...points.map((p) => p.length)) + 2;
  const x = (i: number) => 18 + (i / (points.length - 1)) * (W - 36);
  const y = (v: number) => 12 + (1 - (v - lo) / (hi - lo)) * (H - 24);
  // Плавная линия через точки.
  const path = points
    .map((p, i) => {
      if (i === 0) return `M${x(0)},${y(p.length)}`;
      const px = x(i - 1);
      const py = y(points[i - 1].length);
      const cx = (px + x(i)) / 2;
      return `C${cx},${py} ${cx},${y(p.length)} ${x(i)},${y(p.length)}`;
    })
    .join(" ");
  return (
    <div className="fem-card mt-3 rounded-3xl p-4">
      <p className="text-[0.9375rem] font-semibold">Динамика цикла</p>
      <p className="mb-2 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        Длина каждого цикла · серая полоса — норма 24–38 дней
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }} role="img" aria-label="Длина циклов">
        <rect x={0} y={y(38)} width={W} height={y(24) - y(38)} fill="var(--surface-2)" rx={6} />
        {[24, 38].map((v) => (
          <text key={v} x={W} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--muted)">
            {v}
          </text>
        ))}
        <path d={path} fill="none" stroke="var(--muted)" strokeWidth={2} opacity={0.7} />
        {points.map((p, i) => {
          const bad = p.length < 24 || p.length > 38;
          return (
            <g key={p.from}>
              {bad ? <circle cx={x(i)} cy={y(p.length)} r={11} fill={WARN} opacity={0.25} /> : null}
              <circle cx={x(i)} cy={y(p.length)} r={5} fill={bad ? WARN : "var(--text)"} stroke="var(--surface)" strokeWidth={2} />
              <text
                x={x(i)}
                y={bad && p.length > 38 ? y(p.length) - 12 : y(p.length) + (bad ? 20 : -9)}
                // У краёв — прижимаем подпись внутрь, чтобы не вылезала.
                textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                fontSize={bad ? 9 : 10}
                fontWeight={bad ? 700 : 500}
                fill={bad ? WARN : "var(--muted)"}
              >
                {bad ? `${p.length} · не норма` : p.length}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[0.625rem]" style={{ color: "var(--muted)" }}>
        <span>{short(points[0].from)}</span>
        <span>{short(points[points.length - 1].from)}</span>
      </div>
    </div>
  );
}

/**
 * Ассистент: разбор прошлого цикла. По правилам — сразу, данные не уходят
 * никуда. Нейросеть — по кнопке, после отдельного согласия.
 */
export function CycleAssistant() {
  const { periods, days, settings, saveSettings } = useFem();
  const review = useMemo(() => (settings ? reviewLastCycle(periods, [...days.values()], settings) : null), [periods, days, settings]);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<{ busy?: boolean; text?: string; error?: string } | null>(null);
  if (!review || !settings) return null;

  // agreed — только что дала согласие: настройки в замыкании ещё старые.
  const ask = async (agreed = false) => {
    if (!settings.ai_consent_at && !agreed) {
      setConsent(true);
      return;
    }
    setState({ busy: true });
    try {
      const res = await fetch("/api/fem-analyze", { method: "POST" });
      const body = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
      if (!res.ok || !body?.text) setState({ error: body?.error ?? "Не получилось разобрать — попробуйте позже" });
      else setState({ text: body.text });
    } catch {
      setState({ error: "Нет связи — проверьте интернет" });
    }
  };

  return (
    <div className="fem-card mt-3 rounded-3xl p-4">
      <p className="flex items-center gap-2 text-[0.9375rem] font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: FEM_GRADIENT }}>
          <Icon name="flower" size={14} />
        </span>
        Ассистент: прошлый цикл
      </p>
      <p className="mb-2.5 mt-0.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        {short(review.start)} – {short(review.end)}
      </p>
      <ul className="space-y-1.5 text-[0.8125rem] leading-snug">
        {review.notes.map((n) => (
          <li key={n} className="flex gap-2">
            <span style={{ color: "#ec4899" }}>•</span>
            <span>{n}</span>
          </li>
        ))}
      </ul>

      {state?.text ? (
        <div className="animate-lift mt-3 whitespace-pre-wrap rounded-2xl px-3.5 py-3 text-[0.8125rem] leading-relaxed" style={{ background: "var(--surface-2)" }}>
          {state.text}
        </div>
      ) : null}
      {state?.error ? (
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--danger)" }}>
          {state.error}
        </p>
      ) : null}
      <button
        onClick={() => void ask()}
        disabled={state?.busy}
        className="mt-3 w-full rounded-2xl py-3 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: FEM_GRADIENT }}
      >
        {state?.busy ? "Думает… до минуты" : state?.text ? "Разобрать ещё раз" : "Подробный разбор нейросетью"}
      </button>
      <p className="mt-2 text-center text-[0.625rem]" style={{ color: "var(--muted)" }}>
        Это не диагноз. При отклонениях — к врачу.
      </p>

      <Sheet open={consent} title="Разбор нейросетью" onClose={() => setConsent(false)}>
        <div className="space-y-3 pb-3 text-[0.875rem] leading-snug">
          <p>
            Для подробного разбора обезличенная сводка прошлого цикла уйдёт во внешний сервис нейросетей
            OpenRouter: длины циклов, дни месячных и овуляции, сколько раз отмечены симптомы, настроение и стресс,
            цель и метод контрацепции.
          </p>
          <p style={{ color: "var(--muted)" }}>
            Не уходят: имя, почта, заметки, подробности близости, температура и вес. Разбор запускается только
            вашей кнопкой. Согласие можно отозвать в настройках FemDots.
          </p>
          <button
            onClick={async () => {
              await saveSettings({ ai_consent_at: new Date().toISOString() });
              setConsent(false);
              void ask(true);
            }}
            className="w-full rounded-2xl py-3 text-sm font-semibold text-white"
            style={{ background: FEM_GRADIENT }}
          >
            Согласна, разобрать
          </button>
          <button onClick={() => setConsent(false)} className="w-full rounded-2xl py-3 text-sm font-medium" style={{ background: "var(--surface-2)" }}>
            Не сейчас
          </button>
        </div>
      </Sheet>
    </div>
  );
}
