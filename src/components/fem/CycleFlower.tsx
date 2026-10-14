"use client";

import { useEffect, useRef, useState } from "react";
import { PHASE_COLOR, daysBetween, type CycleInfo, type Phase } from "@/lib/fem/cycle";
import { short } from "@/lib/fem/format";
import { addDays } from "@/lib/tasks/dates";
import { CycleRing, plural, useLearned } from "./parts";

const NS = "http://www.w3.org/2000/svg";

/** Что за лепесток — для подсказки по нажатию. */
const TITLE: Record<string, string> = {
  period: "Месячные",
  follicular: "Энергии больше",
  fertile: "Фертильное окно",
  ovulation: "Овуляция",
  luteal: "Перед месячными",
};
/** Стадия цветка по фазе сегодняшнего дня. */
export const STAGE: Record<string, string> = {
  period: "Бутон",
  follicular: "Раскрытие",
  fertile: "Цветение",
  ovulation: "Пик цветения",
  luteal: "Увядание",
};

/** Капля-лепесток, растущий вверх от точки (0, 0). */
const petalD = (len: number, w: number) =>
  `M0 0 C ${w} ${-len * 0.3} ${w * 0.85} ${-len * 0.82} 0 ${-len} C ${-w * 0.85} ${-len * 0.82} ${-w} ${-len * 0.3} 0 0 Z`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

/**
 * Цветок цикла вместо кольца: лепесток на каждый день, цвет — фаза дня.
 * Прошедшие дни яркие, будущие бледные, сегодняшний длиннее и светится.
 * Форма живёт с циклом: бутон в месячные, раскрытие, цветение с пыльцой
 * в фертильные дни, увядание и опадающие лепестки перед месячными.
 * На гормональной контрацепции и в беременность — прежнее кольцо.
 */
export function CycleFlower({ info, size = 280 }: { info: CycleInfo; size?: number }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [known, learn] = useLearned("fem.hint.ring");
  const usable = !info.hormonal && !info.pregnancy && !!info.lastStart && !!info.ovulation && !!info.fertileStart && !!info.fertileEnd && !!info.nextStart;

  // Длина цикла и фаза каждого дня (1…N).
  const N = usable ? Math.max(daysBetween(info.lastStart!, info.nextStart!), info.cycleDay ?? 0, 15) : 28;
  const fs = usable ? daysBetween(info.lastStart!, info.fertileStart!) + 1 : 0;
  const fe = usable ? daysBetween(info.lastStart!, info.fertileEnd!) + 1 : 0;
  const ov = usable ? daysBetween(info.lastStart!, info.ovulation!) + 1 : 0;
  const pl = usable ? Math.min(info.periodLength, fs - 1) : 0;
  const phaseOf = (k: number): Phase => (k <= pl ? "period" : k === ov ? "ovulation" : k >= fs && k <= fe ? "fertile" : k < fs ? "follicular" : "luteal");
  const day = usable ? Math.min(info.cycleDay ?? 1, N) : 1;
  const late = info.late > 0;

  useEffect(() => {
    const t = picked === null ? undefined : setTimeout(() => setPicked(null), 5000);
    return () => clearTimeout(t);
  }, [picked]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !usable) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const S = size;
    const C = S / 2;
    const k0 = S / 340; // всё рисуем в масштабе макета 340
    const R0 = 56 * k0;
    svg.innerHTML = "";
    const el = (tag: string, a: Record<string, string | number> = {}, parent: Element = svg) => {
      const n = document.createElementNS(NS, tag);
      for (const key in a) n.setAttribute(key, String(a[key]));
      parent.appendChild(n);
      return n;
    };
    const defs = el("defs");
    defs.innerHTML = `<radialGradient id="cf-aura"><stop offset="0%" stop-color="${PHASE_COLOR.fertile}" stop-opacity=".55"/><stop offset="100%" stop-color="${PHASE_COLOR.fertile}" stop-opacity="0"/></radialGradient>
      <filter id="cf-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${4 * k0}"/></filter>`;
    const aura = el("circle", { cx: C, cy: C, r: C * 0.92, fill: "url(#cf-aura)", opacity: 0 });
    const glow = el("path", { fill: late ? PHASE_COLOR.late : "#ec4899", opacity: 0.4, filter: "url(#cf-glow)" });
    const petalsG = el("g");
    const petals = Array.from({ length: N }, (_, i) => {
      const p = el("path", { role: "button", "aria-label": `${i + 1}-й день: ${TITLE[phaseOf(i + 1)]}`, style: "cursor:pointer" }, petalsG);
      p.addEventListener("click", () => {
        learn();
        setPicked((x) => (x === i + 1 ? null : i + 1));
      });
      return p;
    });
    const fx = el("g", { style: "pointer-events:none" });

    // Форма цветка по фазе сегодняшнего дня и месту внутри неё.
    const ph = phaseOf(day);
    const frac = (a: number, b: number) => (b > a ? (day - a) / (b - a) : 1);
    const open =
      ph === "period" ? lerp(0.56, 0.62, frac(1, pl))
      : ph === "follicular" ? lerp(0.52, 0.8, frac(pl + 1, fs - 1))
      : ph === "ovulation" ? 1.08
      : ph === "fertile" ? (day < ov ? lerp(0.82, 1, frac(fs, ov - 1)) : 0.98)
      : lerp(0.96, 0.6, frac(fe + 1, N));
    const curl = ph === "period" ? lerp(0.35, 0.15, frac(1, pl)) : ph === "luteal" ? lerp(0, 0.6, frac(fe + 1, N)) : 0;
    const wide = ph === "period" ? 0.72 : ph === "follicular" ? lerp(0.7, 0.95, frac(pl + 1, fs - 1)) : ph === "luteal" ? lerp(1, 0.75, frac(fe + 1, N)) : 1.03;
    const bloomy = ph === "fertile" || ph === "ovulation";
    const shedding = ph === "luteal" && N - day <= 5;

    type Part = { pollen: boolean; x: number; y: number; vx: number; vy: number; life: number; r: number; rot: number; vr: number; c: string };
    let parts: Part[] = [];
    let raf = 0;
    const t0 = performance.now();
    // Появление: бутон раскрывается до сегодняшнего вида.
    let grow = reduce ? 1 : 0;

    const frame = (now: number) => {
      const s = (now - t0) / 1000;
      grow = reduce ? 1 : Math.min(1, grow + 0.02);
      const g = 1 - Math.pow(1 - grow, 3);
      const o = lerp(0.45, open, g);
      petals.forEach((p, i) => {
        const k = i + 1;
        const isToday = k === day;
        const past = k < day;
        const wave = reduce ? 1 : 1 + 0.03 * Math.sin(s * 1.6 - i * 0.45);
        const len = (78 + (isToday ? 18 : 0) + (k === ov ? 6 : 0)) * k0 * o * wave;
        const w = 15 * k0 * wide * (isToday ? 1.15 : 1) * (28 / Math.max(N, 24)) ** 0.5;
        const a = ((k - 0.5) / N) * 360 + curl * 28 * g + (reduce ? 0 : Math.sin(s * 0.7) * 1.5);
        const tr = `translate(${C} ${C}) rotate(${a}) translate(0 ${-R0 + 6 * k0})`;
        p.setAttribute("d", petalD(len, w));
        p.setAttribute("transform", tr);
        p.setAttribute("fill", PHASE_COLOR[phaseOf(k)]);
        p.setAttribute("fill-opacity", String(isToday ? 1 : past ? 0.92 : 0.28 + 0.15 * o));
        p.setAttribute("stroke", isToday ? "#fff" : "none");
        p.setAttribute("stroke-width", String(isToday ? 2.5 : 0));
        if (isToday) {
          glow.setAttribute("d", petalD(len + 6 * k0, w + 4 * k0));
          glow.setAttribute("transform", tr);
        }
      });
      aura.setAttribute("opacity", String(bloomy ? (0.55 + 0.15 * Math.sin(s * 2)) * g : 0));

      if (!reduce && g > 0.6) {
        if (bloomy && Math.random() < (ph === "ovulation" ? 0.45 : 0.2)) {
          const a = Math.random() * Math.PI * 2;
          const sp = (0.6 + Math.random()) * k0;
          parts.push({ pollen: true, x: C + Math.cos(a) * R0, y: C + Math.sin(a) * R0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.2 * k0, life: 1, r: (1.5 + Math.random() * 2.2) * k0, rot: 0, vr: 0, c: Math.random() < 0.5 ? PHASE_COLOR.ovulation : "#ec4899" });
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
  }, [usable, N, day, fs, fe, ov, pl, size, late]);

  if (!usable) return <CycleRing info={info} size={Math.round(size * 0.86)} />;

  const ph = phaseOf(day);
  const disk = size * (56 / 340) * 2 - 4;
  const sel = picked;
  const selDate = sel ? addDays(info.lastStart!, sel - 1) : null;
  const big = info.current ? `${info.cycleDay}` : late ? `${info.late}` : `${info.daysToNext}`;
  const small = info.current
    ? "день месячных"
    : late
      ? `${plural(info.late, "день", "дня", "дней")} задержки`
      : info.daysToNext === 0
        ? "месячные сегодня"
        : `${plural(info.daysToNext ?? 0, "день", "дня", "дней")} до месячных`;

  return (
    <>
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <svg ref={svgRef} width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" style={{ overflow: "visible" }} />
        {/* Сердцевина: число или, по нажатию на лепесток, что это за день. */}
        <button
          onClick={() => setPicked(null)}
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full text-center"
          style={{
            width: disk,
            height: disk,
            background: `color-mix(in srgb, ${PHASE_COLOR[sel ? phaseOf(sel) : ph]} 22%, var(--surface))`,
            boxShadow: `0 0 0 3px ${PHASE_COLOR[sel ? phaseOf(sel) : ph]}, 0 8px 22px -10px rgba(0,0,0,0.35)`,
            pointerEvents: sel ? "auto" : "none",
          }}
        >
          {sel && selDate ? (
            <span key={sel} className="animate-lift flex flex-col items-center px-1">
              <span className="text-[0.625rem] font-semibold leading-tight" style={{ color: "var(--muted)" }}>
                {sel}-й день
              </span>
              <span className="text-[0.9375rem] font-bold tabular-nums leading-tight">{short(selDate)}</span>
              <span className="text-[0.625rem] font-semibold leading-tight">{TITLE[phaseOf(sel)]}</span>
            </span>
          ) : (
            <>
              <span
                className="font-bold leading-none tabular-nums"
                style={{ fontSize: size * 0.13, color: late ? PHASE_COLOR.late : "var(--text)" }}
              >
                {big}
              </span>
              <span className="mt-0.5 max-w-[5.5rem] text-[0.625rem] font-semibold leading-tight">{small}</span>
            </>
          )}
        </button>
      </div>
      {!known ? (
        <p className="animate-lift mt-1 text-center text-[0.75rem] font-medium" style={{ color: "var(--accent)" }}>
          👆 Нажмите на лепесток — покажу, что это за день
        </p>
      ) : null}
    </>
  );
}

/** Подпись стадии цветка под ним: «Цветение · Фертильное окно». */
export function flowerStage(info: CycleInfo): string | null {
  if (info.hormonal || info.pregnancy || !info.phase) return null;
  return STAGE[info.phase] ?? null;
}

