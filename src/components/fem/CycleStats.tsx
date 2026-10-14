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
  moodsOf,
  signalsFrom,
  type FemPeriod,
} from "@/lib/fem/cycle";
import { reviewLastCycle } from "@/lib/fem/review";
import { short } from "@/lib/fem/format";
import { Sheet } from "@/components/ui";
import { useFem } from "./DataProvider";
import { IntimacyHeart, heartOf, plural } from "./parts";

const OK = "#14b8a6";
const WARN = "#f59e0b";

/**
 * «Цикл в цифрах»: прошлый цикл, прошлые месячные и разброс,
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
      label: "Прошлый цикл",
      value: `${length} ${plural(length, "день", "дня", "дней")}`,
      ok: length >= 24 && length <= 38,
      badge: length >= 24 && length <= 38 ? "Норма" : "Не норма",
      about: "Норма — от 24 до 38 дней, от первого дня одних месячных до первого дня следующих. Один выбившийся цикл бывает у всех; если повторяется — покажитесь врачу.",
    },
    ...(periodDays
      ? [
          {
            key: "period",
            label: "Прошлые месячные",
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
            label: "Разброс между циклами",
            value: `${Math.min(...recent)}–${Math.max(...recent)} дней`,
            ok: spread <= 9,
            badge: spread <= 9 ? "Регулярный" : "Нерегулярный",
            about: "Цикл считается регулярным, если самый короткий и самый длинный из последних отличаются не больше чем на 7–9 дней (FIGO).",
          },
        ]
      : []),
  ];

  return (
    <div className="fem-card mt-3 rounded-3xl p-4">
      <p className="mb-2.5 text-[0.9375rem] font-semibold">Цикл в цифрах</p>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
        {rows.map((r) => (
          <button
            key={r.key}
            onClick={() => setInfo(info === r.key ? null : r.key)}
            aria-expanded={info === r.key}
            className="flex flex-col items-center rounded-2xl px-1.5 py-3 text-center transition active:scale-95"
            style={{
              background: info === r.key ? "var(--surface)" : "var(--surface-2)",
              outline: info === r.key ? `2px solid ${r.ok ? OK : WARN}` : "none",
            }}
          >
            <span className="text-[0.625rem] leading-tight" style={{ color: "var(--muted)" }}>
              {r.label}
            </span>
            <span className="mt-1 text-[1rem] font-bold leading-tight tabular-nums">{r.value}</span>
            <span
              className="mt-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-white"
              style={{ background: r.ok ? OK : WARN }}
            >
              {r.ok ? "✓" : "!"} {r.badge}
            </span>
          </button>
        ))}
      </div>
      {info ? (
        <p className="animate-lift mt-2.5 rounded-2xl px-3 py-2 text-[0.75rem] leading-snug" style={{ background: "var(--surface-2)" }}>
          {rows.find((r) => r.key === info)?.about}
        </p>
      ) : (
        <p className="mt-2 text-center text-[0.625rem]" style={{ color: "var(--muted)" }}>
          Нажмите на плитку — расскажу, что считается нормой
        </p>
      )}
    </div>
  );
}

/** Кружок дня в ленте: размер — сила выделений, обводка — сегодня. */
function Dot({ color, size = 9, ring, today }: { color: string; size?: number; ring?: boolean; today?: boolean }) {
  return (
    <span className="flex h-3 w-3 items-center justify-center">
      <span
        className={`rounded-full ${today ? "animate-fem-glow" : ""}`}
        style={{
          width: size,
          height: size,
          background: color,
          boxShadow: ring ? "0 0 0 2px var(--surface), 0 0 0 3.5px " + OK : today ? "0 0 0 2px var(--surface), 0 0 0 3.5px #ec4899" : undefined,
        }}
      />
    </span>
  );
}

const FLOW_SIZE: Record<string, number> = { spotting: 5, light: 7, medium: 9, heavy: 11 };

/**
 * История циклов: каждый — полоска кружков по дням. Красные — месячные,
 * бирюзовые — фертильные, тёмно-бирюзовый — овуляция, серые — остальное.
 * Нажатие — что было в этом цикле.
 */
export function CycleHistory() {
  const { periods, days, settings, intimacy } = useFem();
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

  /** Как нарисовать день: цвет, размер (сила выделений), овуляция, сердечко. */
  const dayOf = (c: (typeof cycles)[number], k: number) => {
    const d = addDays(c.from, k);
    const color = colorOf(c, k);
    const flow = days.get(d)?.flow;
    const kinds = intimacy.get(d);
    return {
      d,
      color,
      size: color === PHASE_COLOR.period ? (flow ? FLOW_SIZE[flow] : 9) : color === OK ? 10 : 7,
      ring: color === OK,
      today: d === now,
      heart: kinds ? heartOf(kinds) : null,
    };
  };

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
        <p className="text-[0.9375rem] font-semibold">Лента циклов</p>
        {cycles.length > 3 ? (
          <button onClick={() => setAll(!all)} className="flex items-center gap-1 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            {all ? "Свернуть" : `Все ${cycles.length}`}
            <Icon name={all ? "chevron-down" : "chevron-right"} size={14} />
          </button>
        ) : null}
      </div>
      {shown.map((c, i) => {
        const title = c.current
          ? `Сейчас · ${c.length}-й день`
          : `${c.length} ${plural(c.length, "день", "дня", "дней")}`;
        const bad = !c.current && (c.length < 24 || c.length > 38);
        return (
          <button
            key={c.from}
            onClick={() => setOpen({ from: c.from, to: c.to, title })}
            className="animate-lift flex w-full items-start gap-3 px-4 py-3 text-left"
            style={{ borderTop: i ? "1px solid var(--border)" : undefined, animationDelay: `${i * 90}ms` }}
          >
            {/* Длина цикла — пузырём, как кружки в остальных Dots. */}
            <span
              className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full leading-none"
              style={
                c.current
                  ? { background: FEM_GRADIENT, color: "#fff" }
                  : bad
                    ? { background: "color-mix(in srgb, #f59e0b 22%, var(--surface))", color: "#b45309" }
                    : { background: "var(--surface-2)" }
              }
            >
              <span className="text-[1rem] font-bold tabular-nums">{c.length}</span>
              <span className="text-[0.5625rem] opacity-80">{plural(c.length, "день", "дня", "дней")}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between">
                <span className="text-[0.8125rem] font-semibold">
                  {c.current ? `Идёт сейчас · с ${short(c.from)}` : `${short(c.from)} – ${short(c.to)}`}
                </span>
                <Icon name="chevron-right" size={14} className="opacity-30" />
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-[2px]">
                {Array.from({ length: c.length }, (_, k) => {
                  const x = dayOf(c, k);
                  // Текущий цикл «насыпается» кружок за кружком.
                  const pop = c.current ? { className: "dot-pop", style: { animationDelay: `${200 + k * 22}ms` } } : null;
                  return x.heart ? (
                    <span key={k} className={`flex h-3 w-3 items-center justify-center ${pop?.className ?? ""}`} style={pop?.style}>
                      <span className="heart-glow flex" style={{ animationDelay: `${(k % 5) * 0.4}s` }}>
                        <IntimacyHeart kind={x.heart} size={12} />
                      </span>
                    </span>
                  ) : pop ? (
                    <span key={k} className={pop.className} style={pop.style}>
                      <Dot color={x.color} size={x.size} ring={x.ring} today={x.today} />
                    </span>
                  ) : (
                    <Dot key={k} color={x.color} size={x.size} ring={x.ring} today={x.today} />
                  );
                })}
              </span>
            </span>
          </button>
        );
      })}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        <span className="flex items-center gap-1"><Dot color={PHASE_COLOR.period} />Месячные (крупнее — обильнее)</span>
        {info.hormonal ? null : (
          <>
            <span className="flex items-center gap-1"><Dot color={PHASE_COLOR.fertile} />Фертильные</span>
            <span className="flex items-center gap-1"><Dot color={OK} size={8} ring />Овуляция</span>
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
  for (const d of inCycle) for (const m of moodsOf(d)) moods.set(m, (moods.get(m) ?? 0) + 1);
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
      <p className="text-[0.9375rem] font-semibold">Как меняется цикл</p>
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
