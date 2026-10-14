"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { PHASE_COLOR, daysBetween, type CycleInfo, type Phase } from "@/lib/fem/cycle";
import { range, short } from "@/lib/fem/format";
import { addDays } from "@/lib/tasks/dates";
import { Sheet } from "@/components/ui";
import { useFem } from "./DataProvider";
import { CycleRing, plural, useLearned } from "./parts";

export type DialStyle = "flower" | "ring" | "beads" | "comet" | "petals";

/** Виды круга цикла — для выбора в настройках и на самом круге. */
export const DIAL_STYLES: { id: DialStyle; label: string; hint: string }[] = [
  { id: "flower", label: "Цветок", hint: "Лепесток на каждый день, цветок живёт с циклом" },
  { id: "ring", label: "Кольцо", hint: "Классический круг с фазами" },
  { id: "beads", label: "Бусины", hint: "Кружок на каждый день, как логотип Dots" },
  { id: "comet", label: "Комета", hint: "Цветное кольцо и светящаяся комета" },
  { id: "petals", label: "Лепестки", hint: "Четыре фазы — четыре больших лепестка" },
];

const TITLE: Record<string, string> = {
  period: "Месячные",
  follicular: "Энергии больше",
  fertile: "Фертильное окно",
  ovulation: "Овуляция",
  luteal: "Перед месячными",
};
/** Стадия цветка по фазе сегодняшнего дня. */
const STAGE: Record<string, string> = {
  period: "Бутон",
  follicular: "Раскрытие",
  fertile: "Цветение",
  ovulation: "Пик цветения",
  luteal: "Увядание",
};

/** «Цветение · » перед названием фазы — только когда показан цветок. */
export function flowerStage(info: CycleInfo, style: DialStyle): string | null {
  if (style !== "flower" || info.hormonal || info.pregnancy || !info.phase) return null;
  return STAGE[info.phase] ?? null;
}

const NS = "http://www.w3.org/2000/svg";
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeBack = (t: number) => 1 + 2.6 * Math.pow(t - 1, 3) + 1.6 * Math.pow(t - 1, 2);

/** Дни цикла: длина, сегодня и фаза каждого дня (1…N). */
function cycleDays(info: CycleInfo) {
  const usable = !info.hormonal && !info.pregnancy && !!info.lastStart && !!info.ovulation && !!info.fertileStart && !!info.fertileEnd && !!info.nextStart;
  const N = usable ? Math.max(daysBetween(info.lastStart!, info.nextStart!), info.cycleDay ?? 0, 15) : 28;
  const fs = usable ? daysBetween(info.lastStart!, info.fertileStart!) + 1 : 0;
  const fe = usable ? daysBetween(info.lastStart!, info.fertileEnd!) + 1 : 0;
  const ov = usable ? daysBetween(info.lastStart!, info.ovulation!) + 1 : 0;
  const pl = usable ? Math.min(info.periodLength, fs - 1) : 0;
  const phaseOf = (k: number): Phase => (k <= pl ? "period" : k === ov ? "ovulation" : k >= fs && k <= fe ? "fertile" : k < fs ? "follicular" : "luteal");
  const day = usable ? Math.min(info.cycleDay ?? 1, N) : 1;
  const dateOf = (k: number) => addDays(info.lastStart!, k - 1);
  return { usable, N, fs, fe, ov, pl, phaseOf, day, dateOf };
}
type Days = ReturnType<typeof cycleDays>;

/** Что выбрано нажатием: один день или целая фаза. */
type Picked = { day: number } | { from: number; to: number; phase: Phase } | null;

function el(tag: string, a: Record<string, string | number> = {}, parent?: Element) {
  const n = document.createElementNS(NS, tag);
  for (const key in a) n.setAttribute(key, String(a[key]));
  parent?.appendChild(n);
  return n;
}

/**
 * Круг цикла на главной — в виде, выбранном в настройках. Цветок по умолчанию; на
 * гормональной контрацепции и в беременность — всегда классическое кольцо.
 */
export function CycleDial({ info, size = 280 }: { info: CycleInfo; size?: number }) {
  const { profile } = useFem();
  const style: DialStyle = profile?.fem_ring ?? "flower";
  const d = cycleDays(info);
  const [picked, setPicked] = useState<Picked>(null);
  const [known, learn] = useLearned("fem.hint.ring");
  useEffect(() => {
    const t = picked === null ? undefined : setTimeout(() => setPicked(null), 5000);
    return () => clearTimeout(t);
  }, [picked]);
  const pick = (p: Picked) => {
    learn();
    setPicked((x) => (JSON.stringify(x) === JSON.stringify(p) ? null : p));
  };

  if (style === "ring" || !d.usable) {
    return (
      <div className="relative">
        <CycleRing info={info} size={Math.round(size * 0.84)} />
      </div>
    );
  }
  const Body = style === "beads" ? Beads : style === "comet" ? Comet : style === "petals" ? Petals : Flower;
  return (
    <>
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <Body d={d} size={size} pick={pick} late={info.late > 0} />
        <DialCenter info={info} d={d} picked={picked} onClear={() => setPicked(null)} size={size} disk={style === "flower"} />
      </div>
      {!known ? (
        <p className="animate-lift mt-1 text-center text-[0.75rem] font-medium" style={{ color: "var(--accent)" }}>
          👆 Нажмите на {style === "petals" ? "лепесток — покажу фазу" : style === "flower" ? "лепесток — покажу, что это за день" : "круг — покажу, что это за день"}
        </p>
      ) : null}
    </>
  );
}

/** Середина круга: сколько до месячных или — по нажатию — выбранный день. */
function DialCenter({
  info,
  d,
  picked,
  onClear,
  size,
  disk,
}: {
  info: CycleInfo;
  d: Days;
  picked: Picked;
  onClear: () => void;
  size: number;
  disk: boolean;
}) {
  const late = info.late > 0;
  const big = info.current ? `${info.cycleDay}` : late ? `${info.late}` : `${info.daysToNext}`;
  const small = info.current
    ? "день месячных"
    : late
      ? `${plural(info.late, "день", "дня", "дней")} задержки`
      : info.daysToNext === 0
        ? "месячные сегодня"
        : `${plural(info.daysToNext ?? 0, "день", "дня", "дней")} до месячных`;
  const phase = picked ? ("day" in picked ? d.phaseOf(picked.day) : picked.phase) : d.phaseOf(d.day);
  const color = PHASE_COLOR[phase];
  const w = disk ? size * (56 / 340) * 2 - 4 : size * 0.52;
  return (
    <button
      onClick={onClear}
      className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full text-center"
      style={{
        width: w,
        height: w,
        background: disk ? `color-mix(in srgb, ${color} 20%, var(--surface))` : "transparent",
        boxShadow: disk ? `0 0 0 3px ${color}, 0 0 0 7px color-mix(in srgb, ${color} 22%, transparent), 0 10px 24px -10px rgba(0,0,0,0.35)` : undefined,
        pointerEvents: picked ? "auto" : "none",
        transition: "background 400ms, box-shadow 400ms",
      }}
    >
      {picked ? (
        <span key={JSON.stringify(picked)} className="animate-lift flex flex-col items-center px-1">
          <span className="flex items-center gap-1 text-[0.6875rem] font-semibold leading-tight">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            {TITLE[phase]}
          </span>
          <span className="mt-0.5 font-bold tabular-nums leading-tight" style={{ fontSize: disk ? "0.9375rem" : "1.25rem" }}>
            {"day" in picked ? short(d.dateOf(picked.day)) : range(d.dateOf(picked.from), d.dateOf(picked.to))}
          </span>
          <span className="text-[0.625rem] leading-tight" style={{ color: "var(--muted)" }}>
            {"day" in picked ? `${picked.day}-й день цикла` : `${picked.to - picked.from + 1} ${plural(picked.to - picked.from + 1, "день", "дня", "дней")}`}
          </span>
        </span>
      ) : (
        <>
          <span
            className={`font-bold leading-none tabular-nums ${late || disk ? "" : "fem-gradient-text"}`}
            style={{ fontSize: disk ? size * 0.13 : size * 0.2, color: late ? PHASE_COLOR.late : disk ? "var(--text)" : undefined }}
          >
            {big}
          </span>
          <span className="mt-0.5 max-w-[6rem] font-semibold leading-tight" style={{ fontSize: disk ? "0.625rem" : "0.8125rem" }}>
            {small}
          </span>
          {!disk ? (
            <span className="mt-0.5 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              день цикла {info.cycleDay}
            </span>
          ) : null}
        </>
      )}
    </button>
  );
}

/** Строка настроек «Вид круга цикла · [картинка] Цветок ›» — открывает выбор. */
export function DialStyleRow({ className = "" }: { className?: string }) {
  const { profile, saveProfile } = useFem();
  const [open, setOpen] = useState(false);
  const cur: DialStyle = profile?.fem_ring ?? "flower";
  return (
    <>
      <button onClick={() => setOpen(true)} className={`flex w-full items-center gap-3 text-left ${className}`}>
        <DialThumb kind={cur} />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem]">Вид круга цикла</span>
          <span className="block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
            {DIAL_STYLES.find((d) => d.id === cur)?.label} · {DIAL_STYLES.find((d) => d.id === cur)?.hint.toLowerCase()}
          </span>
        </span>
        <Icon name="chevron-right" size={16} className="shrink-0 opacity-40" />
      </button>
      <Sheet open={open} title="Вид круга цикла" onClose={() => setOpen(false)}>
        <DialStylePicker
          value={cur}
          onChange={(v) => {
            void saveProfile({ fem_ring: v === "flower" ? null : v });
            setOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}

/** Список видов круга с маленькими картинками. */
export function DialStylePicker({ value, onChange }: { value: DialStyle; onChange: (v: DialStyle) => void }) {
  return (
    <div className="space-y-2 pb-3">
      {DIAL_STYLES.map((s) => {
        const on = value === s.id;
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            aria-pressed={on}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition active:scale-[0.98]"
            style={{ background: "var(--surface-2)", outline: on ? "2px solid var(--accent)" : "none" }}
          >
            <DialThumb kind={s.id} />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold">
                {s.label}
                {s.id === "flower" ? <span className="ml-1.5 text-[0.6875rem] font-medium" style={{ color: "var(--muted)" }}>по умолчанию</span> : null}
              </span>
              <span className="block text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
                {s.hint}
              </span>
            </span>
            {on ? <Icon name="check" size={18} style={{ color: "var(--accent)" }} /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Значок вида круга — маленькая статичная картинка. */
function DialThumb({ kind }: { kind: DialStyle }) {
  const P = [PHASE_COLOR.period, PHASE_COLOR.follicular, PHASE_COLOR.fertile, PHASE_COLOR.luteal];
  const at = (i: number, n: number, r: number) => [22 + r * Math.cos((i / n) * Math.PI * 2 - Math.PI / 2), 22 + r * Math.sin((i / n) * Math.PI * 2 - Math.PI / 2)];
  const col = (i: number, n: number) => P[Math.min(3, Math.floor((i / n) * 4))];
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" className="shrink-0">
      {kind === "flower"
        ? Array.from({ length: 14 }, (_, i) => (
            <ellipse key={i} cx={22} cy={9} rx={3.2} ry={8} fill={col(i, 14)} transform={`rotate(${(i / 14) * 360} 22 22)`} />
          ))
        : kind === "beads"
          ? Array.from({ length: 16 }, (_, i) => {
              const [x, y] = at(i, 16, 16);
              return <circle key={i} cx={x} cy={y} r={i === 6 ? 4 : 2.6} fill={i === 6 ? "#ec4899" : col(i, 16)} />;
            })
          : kind === "petals"
            ? P.map((c, i) => (
                <path key={i} d={`M ${at(i + 0.12, 4, 15).join(" ")} A 15 15 0 0 1 ${at(i + 0.88, 4, 15).join(" ")}`} fill="none" stroke={c} strokeWidth={8} strokeLinecap="round" />
              ))
            : kind === "comet"
              ? (
                <>
                  <circle cx={22} cy={22} r={15} fill="none" stroke="url(#thumb-conic)" strokeWidth={6} />
                  <defs>
                    <linearGradient id="thumb-conic" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={P[0]} />
                      <stop offset="50%" stopColor={P[2]} />
                      <stop offset="100%" stopColor={P[3]} />
                    </linearGradient>
                  </defs>
                  <circle cx={at(5, 14, 15)[0]} cy={at(5, 14, 15)[1]} r={4.5} fill="#fff" stroke="#ec4899" strokeWidth={2} />
                </>
              )
              : P.map((c, i) => (
                  <path key={i} d={`M ${at(i + 0.06, 4, 15).join(" ")} A 15 15 0 0 1 ${at(i + 0.94, 4, 15).join(" ")}`} fill="none" stroke={c} strokeWidth={5} strokeLinecap="round" />
                ))}
      {kind === "flower" ? <circle cx={22} cy={22} r={6} fill="#fff" stroke={PHASE_COLOR.fertile} strokeWidth={2} /> : null}
    </svg>
  );
}

type BodyProps = { d: Days; size: number; pick: (p: Picked) => void; late: boolean };

/** Капля-лепесток, растущий вверх от точки (0, 0). */
const petalD = (len: number, w: number) =>
  `M0 0 C ${w} ${-len * 0.3} ${w * 0.85} ${-len * 0.82} 0 ${-len} C ${-w * 0.85} ${-len * 0.82} ${-w} ${-len * 0.3} 0 0 Z`;

/**
 * Цветок: два ряда лепестков (задний — пышность, передний — дни), перелив
 * от основания к кончику, прожилки, тычинки-точки вокруг сердцевины.
 * Бутон в месячные → раскрытие → цветение с пыльцой → увядание и
 * опадающие лепестки перед месячными.
 */
function Flower({ d, size, pick, late }: BodyProps) {
  const ref = useRef<SVGSVGElement | null>(null);
  const uid = useId().replace(/:/g, "");
  const { N, day, fs, fe, ov, pl, phaseOf } = d;
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const C = size / 2;
    const k0 = size / 340;
    const R0 = 56 * k0;
    svg.innerHTML = "";
    const defs = el("defs", {}, svg);
    const phases: Phase[] = ["period", "follicular", "fertile", "ovulation", "luteal"];
    defs.innerHTML =
      phases
        .map(
          (p) => `<linearGradient id="${uid}-${p}" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stop-color="${PHASE_COLOR[p]}"/>
            <stop offset="100%" style="stop-color: color-mix(in srgb, ${PHASE_COLOR[p]} 68%, #fff)"/></linearGradient>`,
        )
        .join("") +
      `<radialGradient id="${uid}-aura"><stop offset="0%" stop-color="${PHASE_COLOR.fertile}" stop-opacity=".5"/><stop offset="100%" stop-color="${PHASE_COLOR.fertile}" stop-opacity="0"/></radialGradient>
       <radialGradient id="${uid}-shade"><stop offset="0%" stop-color="#ec4899" stop-opacity=".16"/><stop offset="100%" stop-color="#ec4899" stop-opacity="0"/></radialGradient>
       <filter id="${uid}-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${4 * k0}"/></filter>`;
    el("ellipse", { cx: C, cy: C + 14 * k0, rx: C * 0.86, ry: C * 0.8, fill: `url(#${uid}-shade)` }, svg);
    const aura = el("circle", { cx: C, cy: C, r: C * 0.95, fill: `url(#${uid}-aura)`, opacity: 0 }, svg);
    const back = el("g", {}, svg);
    const glow = el("path", { fill: late ? PHASE_COLOR.late : "#ec4899", opacity: 0.45, filter: `url(#${uid}-glow)` }, svg);
    const front = el("g", {}, svg);
    const veinsG = el("g", { style: "pointer-events:none" }, svg);
    const stamenG = el("g", { style: "pointer-events:none" }, svg);
    const fx = el("g", { style: "pointer-events:none" }, svg);
    const backs = Array.from({ length: N }, (_, i) => el("path", { fill: PHASE_COLOR[phaseOf(i + 1)] }, back));
    const fronts = Array.from({ length: N }, (_, i) => {
      const p = el("path", { role: "button", "aria-label": `${i + 1}-й день: ${TITLE[phaseOf(i + 1)]}`, fill: `url(#${uid}-${phaseOf(i + 1)})`, style: "cursor:pointer" }, front);
      p.addEventListener("click", () => pick({ day: i + 1 }));
      return p;
    });
    const veins = Array.from({ length: N }, () => el("path", { fill: "none", stroke: "#fff", "stroke-linecap": "round" }, veinsG));
    const STAMENS = 18;
    const stamens = Array.from({ length: STAMENS }, (_, i) =>
      el("circle", { fill: i % 3 === 0 ? PHASE_COLOR.ovulation : "#fbbf24", stroke: "#fff", "stroke-width": 0.8 * k0 }, stamenG),
    );

    const ph = phaseOf(day);
    const frac = (a: number, b: number) => (b > a ? (day - a) / (b - a) : 1);
    const open =
      ph === "period" ? lerp(0.56, 0.62, frac(1, pl))
      : ph === "follicular" ? lerp(0.64, 0.84, frac(pl + 1, fs - 1))
      : ph === "ovulation" ? 1.08
      : ph === "fertile" ? (day < ov ? lerp(0.86, 1, frac(fs, ov - 1)) : 0.98)
      : lerp(0.96, 0.62, frac(fe + 1, N));
    const curl = ph === "period" ? lerp(0.35, 0.15, frac(1, pl)) : ph === "luteal" ? lerp(0, 0.6, frac(fe + 1, N)) : 0;
    const wide = ph === "period" ? 0.74 : ph === "follicular" ? lerp(0.8, 0.98, frac(pl + 1, fs - 1)) : ph === "luteal" ? lerp(1, 0.78, frac(fe + 1, N)) : 1.04;
    const bloomy = ph === "fertile" || ph === "ovulation";
    const shedding = ph === "luteal" && N - day <= 5;
    const narrow = Math.sqrt(28 / Math.max(N, 24));

    type Part = { pollen: boolean; x: number; y: number; vx: number; vy: number; life: number; r: number; rot: number; vr: number; c: string };
    let parts: Part[] = [];
    let raf = 0;
    const t0 = performance.now();
    let grow = reduce ? 1 : 0;
    const frame = (now: number) => {
      const s = (now - t0) / 1000;
      grow = reduce ? 1 : Math.min(1, grow + 0.018);
      const g = easeOut(grow);
      const o = lerp(0.45, open, g);
      const sway = reduce ? 0 : Math.sin(s * 0.7) * 1.5;
      for (let i = 0; i < N; i++) {
        const k = i + 1;
        const isToday = k === day;
        const past = k < day;
        const wave = reduce ? 1 : 1 + 0.03 * Math.sin(s * 1.6 - i * 0.45);
        const len = (78 + (isToday ? 18 : 0) + (k === ov ? 6 : 0)) * k0 * o * wave;
        const w = 15 * k0 * wide * (isToday ? 1.15 : 1) * narrow;
        const a = ((k - 0.5) / N) * 360 + curl * 28 * g + sway;
        const tr = `translate(${C} ${C}) rotate(${a}) translate(0 ${-R0 + 6 * k0})`;
        fronts[i].setAttribute("d", petalD(len, w));
        fronts[i].setAttribute("transform", tr);
        fronts[i].setAttribute("opacity", String(isToday ? 1 : past ? 1 : 0.5 + 0.12 * o));
        fronts[i].setAttribute("stroke", isToday ? "#fff" : "rgba(255,255,255,0.5)");
        fronts[i].setAttribute("stroke-width", String((isToday ? 2.5 : 0.6) * k0));
        veins[i].setAttribute("d", `M0 ${-len * 0.14} Q ${w * 0.18} ${-len * 0.5} 0 ${-len * 0.8}`);
        veins[i].setAttribute("transform", tr);
        veins[i].setAttribute("stroke-opacity", String(past || isToday ? 0.5 : 0.25));
        veins[i].setAttribute("stroke-width", String(1.1 * k0));
        // Задний ряд — между днями, длиннее и шире: цветок пышнее.
        const ab = (k / N) * 360 + curl * 34 * g + sway * 0.6;
        backs[i].setAttribute("d", petalD(len * 1.06 + 6 * k0, w * 1.25));
        backs[i].setAttribute("transform", `translate(${C} ${C}) rotate(${ab}) translate(0 ${-R0 + 8 * k0})`);
        backs[i].setAttribute("opacity", String((past ? 0.24 : 0.1) * g));
        if (isToday) {
          glow.setAttribute("d", petalD(len + 6 * k0, w + 4 * k0));
          glow.setAttribute("transform", tr);
        }
      }
      for (let i = 0; i < STAMENS; i++) {
        const a = (i / STAMENS) * Math.PI * 2 + s * 0.15;
        const rr = R0 + 2 * k0;
        stamens[i].setAttribute("cx", String(C + Math.cos(a) * rr));
        stamens[i].setAttribute("cy", String(C + Math.sin(a) * rr));
        stamens[i].setAttribute("r", String((1.6 + 1.2 * o + (reduce ? 0 : 0.5 * Math.sin(s * 3 + i))) * k0 * g));
      }
      aura.setAttribute("opacity", String(bloomy ? (0.55 + 0.15 * Math.sin(s * 2)) * g : 0));

      if (!reduce && g > 0.6) {
        if (bloomy && Math.random() < (ph === "ovulation" ? 0.45 : 0.2)) {
          const a = Math.random() * Math.PI * 2;
          const sp = (0.6 + Math.random()) * k0;
          parts.push({ pollen: true, x: C + Math.cos(a) * R0, y: C + Math.sin(a) * R0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.2 * k0, life: 1, r: (1.5 + Math.random() * 2.2) * k0, rot: 0, vr: 0, c: Math.random() < 0.5 ? PHASE_COLOR.ovulation : "#fbbf24" });
        }
        if (shedding && Math.random() < 0.02 * (6 - (N - day))) {
          const k = Math.floor(Math.random() * N) + 1;
          const a = ((k - 0.5) / N) * Math.PI * 2 - Math.PI / 2;
          const rr = R0 + 50 * k0 * o;
          parts.push({ pollen: false, x: C + Math.cos(a) * rr, y: C + Math.sin(a) * rr, vx: (Math.random() - 0.5) * 0.6 * k0, vy: (0.5 + Math.random() * 0.5) * k0, life: 1, r: 0, rot: Math.random() * 360, vr: (Math.random() - 0.5) * 4, c: PHASE_COLOR[phaseOf(k)] });
        }
      }
      parts = parts.filter((q) => (q.life -= q.pollen ? 0.012 : 0.006) > 0);
      fx.innerHTML = parts
        .map((q) => {
          q.x += q.vx;
          q.y += q.vy;
          if (!q.pollen) {
            q.rot += q.vr;
            q.vx += Math.sin(q.y / 20) * 0.02;
          }
          return q.pollen
            ? `<circle cx="${q.x}" cy="${q.y}" r="${q.r}" fill="${q.c}" opacity="${q.life}"/>`
            : `<path d="${petalD(16 * k0, 5 * k0)}" transform="translate(${q.x} ${q.y}) rotate(${q.rot})" fill="${q.c}" opacity="${Math.min(1, q.life * 1.5)}"/>`;
        })
        .join("");
      if (!reduce || grow < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N, day, fs, fe, ov, pl, size, late]);
  return <svg ref={ref} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" style={{ overflow: "visible" }} />;
}

/** Бусины: кружок на каждый день; вылетают из центра по спирали, в покое — волна. */
function Beads({ d, size, pick, late }: BodyProps) {
  const ref = useRef<SVGSVGElement | null>(null);
  const { N, day, ov, phaseOf } = d;
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    svg.innerHTML = "";
    const C = size / 2;
    const k0 = size / 300;
    const R = size * 0.41;
    const ang = (k: number) => ((k - 0.5) / N) * Math.PI * 2 - Math.PI / 2;
    const beads = Array.from({ length: N }, (_, i) => {
      const k = i + 1;
      const past = k < day;
      const isToday = k === day;
      const isOv = k === ov;
      const color = PHASE_COLOR[phaseOf(k)];
      const g = el("g", { role: "button", "aria-label": `${k}-й день`, style: "cursor:pointer" }, svg);
      const r = (isToday ? 15 : isOv ? 10 : past ? 8 : 7) * k0 * Math.sqrt(28 / Math.max(N, 24));
      el("circle", { r: r + 6 * k0, fill: "transparent" }, g); // попасть пальцем легче
      el("circle", {
        r,
        fill: isToday ? (late ? PHASE_COLOR.late : "#ec4899") : past || isOv ? color : "var(--surface)",
        stroke: isToday ? "#fff" : color,
        "stroke-width": (isToday ? 3.5 : past || isOv ? 0 : 2.5) * k0,
      }, g);
      if (isToday) {
        const t = el("text", { "text-anchor": "middle", "dominant-baseline": "central", "font-size": 12 * k0, "font-weight": 800, fill: "#fff" }, g);
        t.textContent = String(k);
        g.setAttribute("style", "cursor:pointer;filter:drop-shadow(0 6px 10px rgba(236,72,153,.5))");
      }
      if (isOv) el("circle", { r: 3 * k0, fill: "#fff" }, g);
      g.addEventListener("click", () => pick({ day: k }));
      return { g, a: ang(k), k };
    });
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const s = (now - t0) / 1000;
      for (const b of beads) {
        const t = reduce ? 1 : easeOut(Math.min(1, Math.max(0, (s * 1000 - 80 - b.k * (1200 / N)) / 900)));
        const p = (s % 3.5) / 1.6;
        const off = ((b.k - day + N) % N) / N;
        const wave = s > 2.2 && !reduce ? Math.max(0, 1 - Math.abs(p - off) * 9) : 0;
        const rr = (R + wave * 6 * k0) * t;
        const aa = b.a - (1 - t) * Math.PI;
        b.g.setAttribute("transform", `translate(${C + rr * Math.cos(aa)} ${C + rr * Math.sin(aa)}) scale(${Math.min(1, t * 1.2) * (1 + wave * 0.35)})`);
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N, day, ov, size, late]);
  return <svg ref={ref} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" style={{ overflow: "visible" }} />;
}

/** Комета: цветное кольцо со свечением; комета летит от начала цикла к сегодня. */
function Comet({ d, size, pick, late }: BodyProps) {
  const ref = useRef<SVGSVGElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const { N, day, phaseOf } = d;
  // Conic-градиент по фазам дней.
  const stops: string[] = [];
  for (let k = 1; k <= N; k++) {
    const a0 = ((k - 1) / N) * 360;
    const a1 = (k / N) * 360;
    stops.push(`${PHASE_COLOR[phaseOf(k)]} ${a0}deg ${a1}deg`);
  }
  const conic = `conic-gradient(from 0deg, ${stops.join(", ")})`;
  const band = size * 0.075;
  const mask = `radial-gradient(farthest-side, transparent calc(100% - ${band}px), #000 calc(100% - ${band - 1}px))`;
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    svg.innerHTML = "";
    const C = size / 2;
    const k0 = size / 300;
    const R = size * 0.44 - band / 2;
    const L = 2 * Math.PI * R;
    const g = el("g", { transform: `rotate(-90 ${C} ${C})` }, svg);
    const trail = el("circle", { cx: C, cy: C, r: R, fill: "none", stroke: "#fff", "stroke-width": 6 * k0, "stroke-linecap": "round", "stroke-dasharray": `0.01 ${L}` }, g);
    const head = el("g", {}, svg);
    const halo = el("circle", { r: 18 * k0, fill: "#fff", opacity: 0.25 }, head);
    el("circle", { r: 13 * k0, fill: "#fff", stroke: late ? PHASE_COLOR.late : "#ec4899", "stroke-width": 3.5 * k0 }, head);
    const tx = el("text", { "text-anchor": "middle", "dominant-baseline": "central", "font-size": 12 * k0, "font-weight": 800, fill: late ? PHASE_COLOR.late : "#ec4899" }, head);
    const end = (day - 0.5) / N;
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const s = (now - t0) / 1000;
      const ringT = reduce ? 1 : easeOut(Math.min(1, s / 0.8));
      if (ringRef.current) {
        ringRef.current.style.opacity = String(ringT);
        ringRef.current.style.transform = `rotate(${-40 * (1 - ringT)}deg) scale(${0.85 + 0.15 * ringT})`;
      }
      const t = reduce ? 1 : Math.min(1, Math.max(0, (s - 0.5) / 1.7));
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const f = end * e;
      const a = f * Math.PI * 2 - Math.PI / 2;
      head.setAttribute("transform", `translate(${C + R * Math.cos(a)} ${C + R * Math.sin(a)})`);
      const tl = Math.min(f * L, L * 0.22);
      trail.setAttribute("stroke-dasharray", `${Math.max(0.01, tl)} ${L}`);
      trail.setAttribute("stroke-dashoffset", String(-(f * L - tl)));
      trail.setAttribute("stroke-opacity", String(0.85 * (1 - Math.pow(e, 6))));
      tx.textContent = String(Math.max(1, Math.round(f * N + 0.5)));
      if (!reduce) {
        halo.setAttribute("r", String((18 + Math.sin(s * 2.6) * 4) * k0));
        if (glowRef.current) glowRef.current.style.transform = `rotate(${Math.sin(s * 0.5) * 25}deg) scale(${1 + Math.sin(s * 0.8) * 0.04})`;
        raf = requestAnimationFrame(frame);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N, day, size, late]);
  // Нажатие по кольцу — какой это день.
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left - box.width / 2;
    const y = e.clientY - box.top - box.height / 2;
    const dist = Math.hypot(x, y) / (box.width / 2);
    if (dist < 0.62 || dist > 1.05) return;
    let a = Math.atan2(y, x) + Math.PI / 2;
    if (a < 0) a += Math.PI * 2;
    pick({ day: Math.min(N, Math.floor((a / (Math.PI * 2)) * N) + 1) });
  };
  return (
    <div className="absolute inset-0 cursor-pointer" onClick={onClick}>
      <div ref={glowRef} className="pointer-events-none absolute" style={{ inset: "6%", filter: "blur(16px)", opacity: 0.75 }}>
        <div className="absolute inset-0 rounded-full" style={{ background: conic, WebkitMask: mask, mask }} />
      </div>
      <div ref={ringRef} className="pointer-events-none absolute rounded-full" style={{ inset: "6%", background: conic, WebkitMask: mask, mask }} />
      <svg ref={ref} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="pointer-events-none absolute inset-0" style={{ overflow: "visible" }} />
    </div>
  );
}

/** Лепестки: четыре фазы — четыре больших дуги; бутон раскрывается с пружинкой. */
function Petals({ d, size, pick, late }: BodyProps) {
  const ref = useRef<SVGSVGElement | null>(null);
  const { N, day, fs, fe, ov, pl } = d;
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    svg.innerHTML = "";
    const C = size / 2;
    const k0 = size / 300;
    const R = size * 0.39;
    const W = 30 * k0;
    const gap = 0.09;
    const start = (k: number) => ((k - 1) / N) * Math.PI * 2 - Math.PI / 2;
    const ang = (k: number) => ((k - 0.5) / N) * Math.PI * 2 - Math.PI / 2;
    const pt = (a: number, r: number) => [C + r * Math.cos(a), C + r * Math.sin(a)];
    const arc = (a0: number, a1: number) => {
      const [x0, y0] = pt(a0, R);
      const [x1, y1] = pt(a1, R);
      return `M${x0} ${y0} A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
    };
    const groups: { from: number; to: number; phase: Phase }[] = [
      { from: 1, to: pl, phase: "period" as Phase },
      { from: pl + 1, to: fs - 1, phase: "follicular" as Phase },
      { from: fs, to: fe, phase: "fertile" as Phase },
      { from: fe + 1, to: N, phase: "luteal" as Phase },
    ].filter((g) => g.to >= g.from);
    const petals = groups.map((grp, i) => {
      const a0 = start(grp.from) + gap;
      const a1 = start(grp.to + 1) - gap;
      const cur = day >= grp.from && day <= grp.to;
      const mid = (a0 + a1) / 2;
      const g = el("g", { role: "button", "aria-label": TITLE[grp.phase], style: `cursor:pointer;${cur ? "filter:drop-shadow(0 8px 14px rgba(236,72,153,.4))" : ""}` }, svg);
      el("path", { d: arc(a0, a1), fill: "none", stroke: PHASE_COLOR[grp.phase], "stroke-width": cur ? W + 6 * k0 : W, "stroke-linecap": "round" }, g);
      if (grp.phase === "fertile" && ov) {
        const [ox, oy] = pt(ang(ov), R);
        el("circle", { cx: ox, cy: oy, r: 7 * k0, fill: PHASE_COLOR.ovulation, stroke: "#fff", "stroke-width": 2.5 * k0 }, g);
      }
      if (cur) {
        const [mx, my] = pt(ang(day), R);
        el("circle", { cx: mx, cy: my, r: 14 * k0, fill: "#fff", stroke: late ? PHASE_COLOR.late : "#ec4899", "stroke-width": 3.5 * k0 }, g);
        const t = el("text", { x: mx, y: my, "text-anchor": "middle", "dominant-baseline": "central", "font-size": 12 * k0, "font-weight": 800, fill: late ? PHASE_COLOR.late : "#ec4899" }, g);
        t.textContent = String(day);
      }
      g.addEventListener("click", () => pick(grp));
      return { g, mid, cur, i };
    });
    const place = (p: (typeof petals)[number], k: number, sway: number, push: number) => {
      const out = (p.cur ? 8 * k0 : 0) * k + push;
      const dx = Math.cos(p.mid) * out;
      const dy = Math.sin(p.mid) * out;
      p.g.setAttribute("transform", `translate(${dx} ${dy}) rotate(${-120 * (1 - k) + sway} ${C} ${C}) translate(${C} ${C}) scale(${k}) translate(${-C} ${-C})`);
    };
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const s = (now - t0) / 1000;
      for (const p of petals) {
        const t = reduce ? 1 : Math.min(1, Math.max(0, (s * 1000 - 150 - p.i * 160) / 1100));
        const k = reduce ? 1 : easeBack(t);
        const idle = !reduce && t >= 1;
        place(p, k, idle ? Math.sin(s * 1.1 + p.i) * 1.6 : 0, idle && p.cur ? Math.sin(s * 2.2) * 2.5 * k0 : 0);
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [N, day, fs, fe, ov, pl, size, late]);
  return <svg ref={ref} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" style={{ overflow: "visible" }} />;
}
