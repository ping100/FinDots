"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { PHASE_COLOR, daysBetween, type CycleInfo, type Phase } from "@/lib/fem/cycle";
import { hot, skyOf, useWeather, weatherLine, windy, type Sky } from "@/lib/fem/weather";
import { range, short } from "@/lib/fem/format";
import { addDays } from "@/lib/tasks/dates";
import { Sheet, Switch } from "@/components/ui";
import { useFem } from "./DataProvider";
import { CycleRing, plural, useLearned } from "./parts";

export type DialStyle = "flower" | "life" | "ring" | "beads" | "comet" | "petals";

/** Виды круга цикла — для выбора в настройках и на самом круге. */
export const DIAL_STYLES: { id: DialStyle; label: string; hint: string; beta?: boolean }[] = [
  { id: "flower", label: "Цветок", hint: "Лепесток на каждый день, цветок живёт с циклом" },
  { id: "life", label: "Жизнь цветка", hint: "Бутон, цветение, семена и облетание за цикл", beta: true },
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
  late: "Ожидание",
};

/** Стадии «Жизни цветка»: после овуляции — семена, увядание, облетание. */
const LIFE_STAGE: Record<string, string> = {
  period: "Бутон",
  follicular: "Раскрытие",
  fertile: "Цветение",
  ovulation: "Пик цветения",
  late: "Новый бутон зреет",
};

/** «Цветение · » перед названием фазы — только когда показан цветок. */
export function flowerStage(info: CycleInfo, style: DialStyle): string | null {
  if ((style !== "flower" && style !== "life") || info.hormonal || info.pregnancy || !info.phase) return null;
  if (style === "life" && info.phase === "luteal") {
    const left = info.daysToNext ?? 99;
    return left <= 2 ? "Облетание" : left <= 7 ? "Увядание" : "Семена зреют";
  }
  return (style === "life" ? LIFE_STAGE : STAGE)[info.phase] ?? null;
}

const NS = "http://www.w3.org/2000/svg";
/** Лепестки дней задержки: основание и кончик. */
const LATE_PETAL: [string, string] = ["#f59e0b", "#fde68a"];
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeBack = (t: number) => 1 + 2.6 * Math.pow(t - 1, 3) + 1.6 * Math.pow(t - 1, 2);

/** Дни цикла: длина, сегодня и фаза каждого дня (1…N). */
function cycleDays(info: CycleInfo) {
  const usable = !info.hormonal && !info.pregnancy && !!info.lastStart && !!info.ovulation && !!info.fertileStart && !!info.fertileEnd && !!info.nextStart;
  // При задержке круг не растёт: остаётся длиной обычного цикла.
  const lateDays = usable ? info.late : 0;
  const N = usable
    ? lateDays > 0
      ? Math.max(daysBetween(info.lastStart!, info.nextStart!), 15)
      : Math.max(daysBetween(info.lastStart!, info.nextStart!), info.cycleDay ?? 0, 15)
    : 28;
  const fs = usable ? daysBetween(info.lastStart!, info.fertileStart!) + 1 : 0;
  const fe = usable ? daysBetween(info.lastStart!, info.fertileEnd!) + 1 : 0;
  const ov = usable ? daysBetween(info.lastStart!, info.ovulation!) + 1 : 0;
  const pl = usable ? Math.min(info.periodLength, fs - 1) : 0;
  const phaseOf = (k: number): Phase => (k <= pl ? "period" : k === ov ? "ovulation" : k >= fs && k <= fe ? "fertile" : k < fs ? "follicular" : "luteal");
  const day = usable ? Math.min(info.cycleDay ?? 1, N) : 1;
  const dateOf = (k: number) => addDays(info.lastStart!, k - 1);
  return { usable, N, fs, fe, ov, pl, phaseOf, day, dateOf, lateDays };
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
export function CycleDial({ info, size: guess = 280, partnerView = false }: { info: CycleInfo; size?: number; partnerView?: boolean }) {
  const { profile } = useFem();
  const style: DialStyle = profile?.fem_ring ?? "flower";
  // Погода (эксперимент) — только у цветка. Партнёр может смотреть на её погоду.
  const wxOn = !!profile?.fem_weather && (style === "flower" || style === "life");
  const wxNow = useWeather(wxOn, partnerView && profile?.fem_weather_src === "hers" ? "hers" : "mine");
  const wx: WxLook | null = wxNow ? { sky: skyOf(wxNow.weather.code), windy: windy(wxNow.weather), hot: hot(wxNow.weather) } : null;
  const d = cycleDays(info);
  const [picked, setPicked] = useState<Picked>(null);
  const [known, learn] = useLearned("fem.hint.ring");
  // Размер — от ширины карточки, чтобы круг занимал её почти целиком.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const t = picked === null ? undefined : setTimeout(() => setPicked(null), 5000);
    return () => clearTimeout(t);
  }, [picked]);
  const pick = (p: Picked) => {
    learn();
    setPicked((x) => (JSON.stringify(x) === JSON.stringify(p) ? null : p));
  };

  const w = width ?? guess;
  if (style === "ring" || !d.usable) {
    return (
      <div ref={boxRef} className="relative w-full">
        <CycleRing info={info} size={Math.round(Math.min(w * 0.82, 300))} />
      </div>
    );
  }
  const flower = style === "flower" || style === "life";
  // Цветок рисует лепестки примерно на 3/4 своего поля (запас под пыльцу
  // и пик цветения) — поэтому поле шире карточки, а лишнее по краям пусто.
  const size = Math.round(flower ? Math.min(w * 1.22, 470) : Math.min(w * 0.94, 360));
  const height = Math.round(flower ? size * 0.88 : size);
  const Body = style === "beads" ? Beads : style === "comet" ? Comet : style === "petals" ? Petals : style === "life" ? LifeFlower : Flower;
  return (
    <>
      <div ref={boxRef} className="relative w-full" style={{ height }}>
        <div className="absolute left-1/2" style={{ width: size, height: size, top: (height - size) / 2, transform: "translateX(-50%)" }}>
          <Body d={d} size={size} pick={pick} late={info.late > 0} wx={wx} />
          <DialCenter info={info} d={d} picked={picked} onClear={() => setPicked(null)} size={size} disk={flower} />
        </div>
      </div>
      {wxNow ? (
        <p className="animate-fade -mt-1 mb-1 text-center text-[0.75rem] font-medium" style={{ color: "var(--muted)" }}>
          {partnerView ? (wxNow.whose === "hers" ? "У неё: " : "У вас: ") : ""}
          {weatherLine(wxNow.weather)}
        </p>
      ) : null}
      {!known ? (
        <p className="animate-lift mt-1 text-center text-[0.75rem] font-medium" style={{ color: "var(--accent)" }}>
          👆 Нажмите на {style === "petals" ? "лепесток — покажу фазу" : flower ? "лепесток — покажу, что это за день" : "круг — покажу, что это за день"}
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
  const color = !picked && late ? PHASE_COLOR.late : PHASE_COLOR[phase];
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
          <span className="mt-0.5 font-bold tabular-nums leading-tight" style={{ fontSize: disk ? Math.max(15, size * 0.045) : "1.25rem" }}>
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
          <span className="mt-0.5 font-semibold leading-tight" style={{ fontSize: disk ? Math.max(10, size * 0.03) : "0.8125rem", maxWidth: disk ? size * 0.26 : "6rem" }}>
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
  const { profile, saveProfile, partner } = useFem();
  const [open, setOpen] = useState(false);
  const cur: DialStyle = profile?.fem_ring ?? "flower";
  const flowerish = cur === "flower" || cur === "life";
  return (
    <>
      <button onClick={() => setOpen(true)} className={`flex w-full items-center gap-3 text-left ${className}`}>
        <DialThumb kind={cur} />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem]">Вид круга цикла</span>
          <span className="block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
            {DIAL_STYLES.find((d) => d.id === cur)?.label} ·{" "}
            {flowerish && (profile?.fem_daytime || profile?.fem_weather)
              ? [profile?.fem_daytime ? "по времени суток" : "", profile?.fem_weather ? "по погоде" : ""].filter(Boolean).join(" и ")
              : DIAL_STYLES.find((d) => d.id === cur)?.hint.toLowerCase()}
          </span>
        </span>
        <Icon name="chevron-right" size={16} className="shrink-0 opacity-40" />
      </button>
      <Sheet open={open} title="Вид круга цикла" onClose={() => setOpen(false)}>
        <DialStylePicker
          value={cur}
          onChange={(v) => {
            void saveProfile({ fem_ring: v === "flower" ? null : v });
            if (v !== "flower" && v !== "life") setOpen(false);
          }}
        />
        {flowerish ? (
          <div className="space-y-2 pb-3">
            <ExpRow
              icon={profile?.fem_daytime ? "🌙" : "☀️"}
              title="По времени суток"
              hint="Утром роса, днём солнце и бабочка, вечером закат, ночью луна и светлячки"
              on={!!profile?.fem_daytime}
              onChange={(v) => void saveProfile({ fem_daytime: v })}
            />
            <ExpRow
              icon="🌦"
              title="По погоде"
              hint="Дождь, снег, туман, гроза и ветер, как за окном. Город определяется по интернету"
              on={!!profile?.fem_weather}
              onChange={(v) => void saveProfile({ fem_weather: v })}
            >
              {profile?.fem_weather && partner ? (
                <div className="mt-2.5 grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: "var(--surface)" }}>
                  {(
                    [
                      ["mine", "Моя погода"],
                      ["hers", "Её погода"],
                    ] as const
                  ).map(([id, label]) => {
                    const sel = (profile?.fem_weather_src ?? "mine") === id;
                    return (
                      <button
                        key={id}
                        onClick={() => void saveProfile({ fem_weather_src: id })}
                        aria-pressed={sel}
                        className="rounded-lg py-1.5 text-[0.8125rem] font-semibold transition active:scale-[0.98]"
                        style={sel ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </ExpRow>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

/** Строка экспериментальной настройки цветка: значок, название, пояснение, выключатель. */
function ExpRow({
  icon,
  title,
  hint,
  on,
  onChange,
  children,
}: {
  icon: string;
  title: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl px-3 py-3" style={{ background: "var(--surface-2)" }}>
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-semibold">
            {title}
            <span
              className="ml-1.5 rounded-full px-1.5 py-0.5 align-middle text-[0.625rem] font-semibold"
              style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}
            >
              эксперимент
            </span>
          </span>
          <span className="block text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
            {hint}
          </span>
        </span>
        <Switch checked={on} onChange={onChange} label={title} />
      </div>
      {children}
    </div>
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
                {s.beta ? (
                  <span
                    className="ml-1.5 rounded-full px-1.5 py-0.5 align-middle text-[0.625rem] font-semibold"
                    style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}
                  >
                    эксперимент
                  </span>
                ) : null}
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
      {kind === "life"
        ? (
          <>
            {Array.from({ length: 14 }, (_, i) => (
              <ellipse key={i} cx={22} cy={10} rx={3} ry={7} fill={i % 3 ? "#e9c9b5" : col(i, 14)} transform={`rotate(${(i / 14) * 360 + 8} 22 22)`} />
            ))}
            {Array.from({ length: 22 }, (_, i) => {
              const r = 4 + Math.sqrt(i / 22) * 5;
              const a = i * 2.39996;
              return <circle key={`s${i}`} cx={22 + Math.cos(a) * r} cy={22 + Math.sin(a) * r} r={1} fill="#b07f23" />;
            })}
          </>
        )
        : kind === "flower"
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
      {kind === "life" ? <circle cx={22} cy={22} r={3.6} fill="#fff" stroke={PHASE_COLOR.luteal} strokeWidth={1.5} /> : null}
    </svg>
  );
}

type BodyProps = { d: Days; size: number; pick: (p: Picked) => void; late: boolean; wx?: WxLook | null };

/** Погода для цветка: какое небо, сильный ли ветер, жара ли. */
type WxLook = { sky: Sky; windy: boolean; hot: boolean };

/** Свет вокруг цветка по погоде — поверх света времени суток. */
const wxSkyLook = (sky: Sky | null, hot: boolean): [string, string, number] | null =>
  sky === "rain" ? ["#cbd5e1", "#94a3b8", 0.55]
  : sky === "storm" ? ["#94a3b8", "#64748b", 0.6]
  : sky === "snow" ? ["#e0f2fe", "#93c5fd", 0.55]
  : sky === "fog" ? ["#f1f5f9", "#cbd5e1", 0.6]
  : sky === "clouds" ? ["#e2e8f0", "#cbd5e1", 0.5]
  : hot ? ["#fde68a", "#fdba74", 0.5]
  : null;

/** Облачко из кружков; ширина ~56, высота ~22 (до масштаба). */
const CLOUD = `<ellipse cx="0" cy="6" rx="28" ry="9"/><circle cx="-12" cy="0" r="10"/><circle cx="4" cy="-5" r="13"/><circle cx="17" cy="2" r="9"/>`;
/** Листик, который несёт ветер. */
const LEAF = `<path d="M0 -6 C 5 -3, 5 3, 0 6 C -5 3, -5 -3, 0 -6Z" fill="#86c99a"/><path d="M0 -5 L0 5" stroke="#4d9a68" stroke-width=".7"/>`;

/** Капля-лепесток, растущий вверх от точки (0, 0). */
const petalD = (len: number, w: number) =>
  `M0 0 C ${w} ${-len * 0.3} ${w * 0.85} ${-len * 0.82} 0 ${-len} C ${-w * 0.85} ${-len * 0.82} ${-w} ${-len * 0.3} 0 0 Z`;
/** Лепесток со скрученным кончиком: c — насколько кончик ушёл вбок (0…1). */
const petalCurlD = (len: number, w: number, c: number) => {
  const tx = c * w * 1.6;
  return `M0 0 C ${w} ${-len * 0.3} ${w * 0.85 + tx * 0.5} ${-len * 0.82} ${tx} ${-len} C ${-w * 0.85 + tx * 0.9} ${-len * 0.82} ${-w + tx * 0.2} ${-len * 0.3} 0 0 Z`;
};
/** Пушинка-семечко для облетания. */
const FLUFF = `<path d="M0 0 L0 -9" stroke="#b8a48c" stroke-width=".8"/>${Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  return `<path d="M0 -9 l${(Math.cos(a) * 5).toFixed(1)} ${(Math.sin(a) * 5).toFixed(1)}" stroke="#e8dccb" stroke-width=".7"/>`;
}).join("")}<ellipse cx="0" cy="1" rx="1.4" ry="2" fill="#8a6a3a"/>`;

/** Время суток по часам телефона: утро 5–10, день 10–17, вечер 17–21, ночь. */
export type Tod = "morning" | "day" | "evening" | "night";
export const timeOfDay = (h: number): Tod => (h >= 5 && h < 10 ? "morning" : h >= 10 && h < 17 ? "day" : h >= 17 && h < 21 ? "evening" : "night");

function useTimeOfDay(): Tod {
  const [tod, setTod] = useState<Tod>(() => timeOfDay(new Date().getHours()));
  useEffect(() => {
    const t = setInterval(() => setTod(timeOfDay(new Date().getHours())), 60_000);
    return () => clearInterval(t);
  }, []);
  return tod;
}

/** Свет вокруг цветка и оттенок поверх него — у каждого времени суток свой. */
const TOD_LOOK: Record<Tod, { sky: [string, string, number]; tint: [string, number, string] | null }> = {
  morning: { sky: ["#fed7aa", "#f9a8d4", 0.6], tint: ["#e0f2fe", 0.3, "soft-light"] },
  day: { sky: ["#fef9c3", "#bae6fd", 0.65], tint: null },
  evening: { sky: ["#fdba74", "#fb7185", 0.55], tint: ["#fb923c", 0.32, "multiply"] },
  night: { sky: ["#4338ca", "#1e1b4b", 0.4], tint: ["#1e3a8a", 0.3, "multiply"] },
};

/** Бабочка: два крыла с каждой стороны, f — насколько раскрыты (0…1). */
const BF_UP = "M0 -1 C 5 -12, 16 -12, 13 -2 C 12 2, 5 2, 0 0Z";
const BF_LO = "M0 0 C 7 1, 11 8, 6 10 C 2 11, 0 6, 0 1Z";
const butterfly = (uid: string, f: number) => {
  const wing = `<path d="${BF_UP}" fill="url(#${uid}-bf)" stroke="#fff" stroke-width=".5"/><path d="${BF_LO}" fill="url(#${uid}-bf2)" stroke="#fff" stroke-width=".5"/><circle cx="9" cy="-5" r="1.4" fill="#fff" opacity=".75"/>`;
  return `<g transform="scale(${f.toFixed(2)} 1)">${wing}</g><g transform="scale(${(-f).toFixed(2)} 1)">${wing}</g><ellipse rx="1.2" ry="6" fill="#4a3657"/><path d="M-.4 -5.5 Q-3 -10 -4 -11 M.4 -5.5 Q3 -10 4 -11" stroke="#4a3657" stroke-width=".6" fill="none"/>`;
};

/** «Жизнь цветка» (эксперимент): тот же цветок, но живёт по-настоящему. */
const LifeFlower = (p: BodyProps) => <Flower {...p} life />;

/**
 * Цветок: два ряда лепестков (задний — пышность, передний — дни), перелив
 * от основания к кончику, прожилки, тычинки-точки вокруг сердцевины.
 * Бутон в месячные → раскрытие → цветение с пыльцой → увядание и
 * опадающие лепестки перед месячными.
 */
function Flower({ d, size, pick, late, life = false, wx = null }: BodyProps & { life?: boolean }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const uid = useId().replace(/:/g, "");
  const { N, day, fs, fe, ov, pl, phaseOf, lateDays } = d;
  const { profile } = useFem();
  const clock = useTimeOfDay();
  // Время суток — отдельный переключатель (эксперимент), для обоих цветков.
  const tod: Tod | null = profile?.fem_daytime ? clock : null;
  const wxSky = wx?.sky ?? null;
  const wxWindy = !!wx?.windy;
  const wxHot = !!wx?.hot;
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const C = size / 2;
    const k0 = size / 340;
    // Задержка: цветок не увядает и не растёт, а спокойно «ждёт».
    const waiting = lateDays > 0;
    const R0 = 56 * k0;
    const skyLook = wxSkyLook(wxSky, wxHot) ?? (tod ? TOD_LOOK[tod].sky : null);
    const overcast = wxSky !== null && wxSky !== "clear";
    const wet = wxSky === "rain" || wxSky === "storm";
    svg.innerHTML = "";
    const defs = el("defs", {}, svg);
    const phases: Phase[] = ["period", "follicular", "fertile", "ovulation", "luteal"];
    defs.innerHTML =
      phases
        .map((p) =>
          p === "ovulation"
            ? // Овуляция — глубокий бирюзовый, чтобы не сливаться с фертильными.
              `<linearGradient id="${uid}-${p}" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stop-color="#0f766e"/><stop offset="60%" stop-color="#14b8a6"/><stop offset="100%" stop-color="#99f6e4"/></linearGradient>`
            : `<linearGradient id="${uid}-${p}" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stop-color="${PHASE_COLOR[p]}"/>
            <stop offset="100%" style="stop-color: color-mix(in srgb, ${PHASE_COLOR[p]} 68%, #fff)"/></linearGradient>`,
        )
        .join("") +
      `<radialGradient id="${uid}-aura"><stop offset="0%" stop-color="${PHASE_COLOR.fertile}" stop-opacity=".5"/><stop offset="100%" stop-color="${PHASE_COLOR.fertile}" stop-opacity="0"/></radialGradient>
       <linearGradient id="${uid}-late" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="${LATE_PETAL[0]}"/><stop offset="100%" stop-color="${LATE_PETAL[1]}"/></linearGradient>
       <radialGradient id="${uid}-wait"><stop offset="0%" stop-color="${PHASE_COLOR.late}" stop-opacity=".45"/><stop offset="100%" stop-color="${PHASE_COLOR.late}" stop-opacity="0"/></radialGradient>
       <radialGradient id="${uid}-shade"><stop offset="0%" stop-color="#ec4899" stop-opacity=".16"/><stop offset="100%" stop-color="#ec4899" stop-opacity="0"/></radialGradient>
       <filter id="${uid}-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${4 * k0}"/></filter>` +
      `<filter id="${uid}-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${14 * k0}"/></filter>
       <radialGradient id="${uid}-fog"><stop offset="0%" stop-color="#fff" stop-opacity=".75"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
      (skyLook
        ? `<radialGradient id="${uid}-sky"><stop offset="30%" stop-color="${skyLook[0]}" stop-opacity="${skyLook[2]}"/><stop offset="70%" stop-color="${skyLook[1]}" stop-opacity="${skyLook[2] * 0.6}"/><stop offset="100%" stop-color="${skyLook[1]}" stop-opacity="0"/></radialGradient>`
        : "") +
      (tod
        ? `<radialGradient id="${uid}-sun"><stop offset="0%" stop-color="#fffbeb"/><stop offset="45%" stop-color="${tod === "evening" ? "#fdba74" : tod === "morning" ? "#fed7aa" : "#fde047"}"/><stop offset="100%" stop-color="${tod === "evening" ? "#f97316" : "#fbbf24"}"/></radialGradient>
           <radialGradient id="${uid}-tint"><stop offset="0%" stop-color="${TOD_LOOK[tod].tint?.[0] ?? "#fff"}"/><stop offset="70%" stop-color="${TOD_LOOK[tod].tint?.[0] ?? "#fff"}" stop-opacity=".8"/><stop offset="100%" stop-color="${TOD_LOOK[tod].tint?.[0] ?? "#fff"}" stop-opacity="0"/></radialGradient>
           <linearGradient id="${uid}-bf" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#f0abfc"/><stop offset="100%" stop-color="#a78bfa"/></linearGradient>
           <linearGradient id="${uid}-bf2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f9a8d4"/><stop offset="100%" stop-color="#fb7185"/></linearGradient>`
        : "") +
      (life
        ? phases
            .map(
              (p) => `<linearGradient id="${uid}-${p}-dry" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" style="stop-color: color-mix(in srgb, ${PHASE_COLOR[p]} 70%, #b08a6a)"/>
            <stop offset="70%" style="stop-color: color-mix(in srgb, ${PHASE_COLOR[p]} 35%, #e8d6bf)"/>
            <stop offset="100%" stop-color="#c9a27a"/></linearGradient>`,
            )
            .join("") +
          `<radialGradient id="${uid}-bud" cx=".45" cy=".4"><stop offset="0%" stop-color="#ffe4ec"/><stop offset="100%" stop-color="${PHASE_COLOR.period}"/></radialGradient>`
        : "");
    if (skyLook) el("circle", { cx: C, cy: C, r: C * 0.98, fill: `url(#${uid}-sky)` }, svg);
    // Солнце или луна в углу — время суток видно сразу.
    let rays: Element | null = null;
    const stars: Element[] = [];
    if (tod) {
      // В непогоду солнце и луна еле видны за облаками.
      const sky = el("g", { style: "pointer-events:none", opacity: overcast ? 0.4 : 1 }, svg);
      const at = tod === "morning" ? [C - 0.7 * C, C - 0.74 * C] : tod === "evening" ? [C + 0.72 * C, C - 0.66 * C] : [C + 0.7 * C, C - 0.76 * C];
      const r = (tod === "evening" ? 15 : 13) * k0;
      if (tod === "night") {
        for (let j = 0; j < 14; j++) {
          const a = j * 2.39996 + 0.6;
          const rr = C * (0.78 + ((j * 37) % 17) / 100);
          if (!overcast) stars.push(el("circle", { cx: C + Math.cos(a) * rr, cy: C + Math.sin(a) * rr * 0.92, r: (0.8 + (j % 3) * 0.45) * k0, fill: "#e0e7ff" }, sky));
        }
        el("circle", { cx: at[0], cy: at[1], r: r * 2.2, fill: "#e0e7ff", opacity: 0.6, filter: `url(#${uid}-glow)` }, sky);
        el("path", { d: `M0 ${-r} A ${r} ${r} 0 1 0 0 ${r} A ${r * 0.45} ${r} 0 1 1 0 ${-r}Z`, transform: `translate(${at[0] - r * 0.2} ${at[1]}) rotate(-25) scale(1.25)`, fill: "#fef3c7", stroke: "#fde68a", "stroke-width": 0.8 * k0 }, sky);
      } else {
        el("circle", { cx: at[0], cy: at[1], r: r * 2.3, fill: tod === "evening" ? "#fb923c" : "#fde047", opacity: tod === "day" ? 0.45 : 0.35, filter: `url(#${uid}-glow)` }, sky);
        if (tod === "day" && !overcast) {
          rays = el("g", { transform: `translate(${at[0]} ${at[1]})` }, sky);
          for (let j = 0; j < 10; j++)
            el("path", { d: `M0 ${-r * 1.45} L0 ${-r * 2}`, transform: `rotate(${j * 36})`, stroke: "#fbbf24", "stroke-width": 2 * k0, "stroke-linecap": "round", opacity: 0.8 }, rays);
        }
        el("circle", { cx: at[0], cy: at[1], r, fill: `url(#${uid}-sun)`, opacity: tod === "morning" ? 0.9 : 1 }, sky);
      }
    }
    // Облака: плывут по верху, в дождь серые, в грозу тёмные.
    const clouds: Element[] = [];
    if (wxSky === "clouds" || wet || wxSky === "snow") {
      const fill = wxSky === "storm" ? "#64748b" : wxSky === "rain" ? "#94a3b8" : "#fff";
      const cg = el("g", { style: "pointer-events:none", fill, stroke: wxSky === "clouds" || wxSky === "snow" ? "#e2e8f0" : "none", "stroke-width": 0.8 }, svg);
      for (let j = 0; j < 3; j++) {
        const c = el("g", { opacity: wxSky === "clouds" ? 0.92 : 0.85 }, cg);
        c.innerHTML = CLOUD;
        clouds.push(c);
      }
    }
    // Вечером солнце низко — тень длинная, вбок.
    if (tod === "evening" && !overcast)
      el("ellipse", { cx: C + 40 * k0, cy: C + 52 * k0, rx: C * 0.7, ry: C * 0.32, transform: `rotate(18 ${C + 40 * k0} ${C + 52 * k0})`, fill: "#7c2d12", opacity: 0.12, filter: `url(#${uid}-soft)` }, svg);
    el("ellipse", { cx: C, cy: C + 14 * k0, rx: C * 0.86, ry: C * 0.8, fill: `url(#${uid}-shade)` }, svg);
    const aura = el("circle", { cx: C, cy: C, r: C * 0.95, fill: `url(#${uid}-${waiting ? "wait" : "aura"})`, opacity: 0 }, svg);
    const back = el("g", {}, svg);
    const ovGlow = el("path", { fill: "#14b8a6", opacity: 0.55, filter: `url(#${uid}-glow)` }, svg);
    const glow = el("path", { fill: late ? PHASE_COLOR.late : "#ec4899", opacity: 0.45, filter: `url(#${uid}-glow)` }, svg);
    // Ночью серединка тихо светится сквозь сомкнутые лепестки.
    const nightGlow = tod === "night" ? el("circle", { cx: C, cy: C, r: R0 + 14 * k0, fill: "#fde68a", filter: `url(#${uid}-glow)`, opacity: 0 }, svg) : null;
    const front = el("g", {}, svg);
    const veinsG = el("g", { style: "pointer-events:none" }, svg);
    // Звёздочка на кончике лепестка овуляции.
    const ovStarG = el("g", { style: "pointer-events:none" }, svg);
    const ovStar = el("path", { d: "M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8 Z", fill: "#fff", stroke: "#14b8a6", "stroke-width": 1 }, ovStarG);
    // Утренняя роса — на каждом третьем лепестке.
    const dewG = el("g", { style: "pointer-events:none" }, svg);
    // Роса утром и капли в дождь; в снег — белые шапочки на кончиках.
    const dews = tod === "morning" || wet
      ? Array.from({ length: N }, (_, i) => {
          if (i % 2 !== 1) return null;
          const g = el("g", {}, dewG);
          el("ellipse", { cx: 0.6 * k0, cy: 1.2 * k0, rx: 3.6 * k0, ry: 3.9 * k0, fill: "rgba(80,40,90,.12)" }, g);
          el("ellipse", { rx: 3.6 * k0, ry: 4 * k0, fill: "rgba(255,255,255,.4)", stroke: "rgba(255,255,255,.95)", "stroke-width": 1 * k0 }, g);
          el("circle", { cx: -1.2 * k0, cy: -1.5 * k0, r: 1.3 * k0, fill: "#fff" }, g);
          return g;
        })
      : [];
    const caps = wxSky === "snow"
      ? Array.from({ length: N }, (_, i) => {
          if (i % 2 !== 0) return null;
          return el("ellipse", { rx: 6 * k0, ry: 3.4 * k0, fill: "#fff", stroke: "#dbeafe", "stroke-width": 0.8 * k0 }, dewG);
        })
      : [];
    const stamenG = el("g", { style: "pointer-events:none" }, svg);
    const tintLook = tod ? TOD_LOOK[tod].tint : null;
    if (tintLook) el("circle", { cx: C, cy: C, r: C * 0.95, fill: `url(#${uid}-tint)`, opacity: tintLook[1], style: `pointer-events:none;mix-blend-mode:${tintLook[2]}` }, svg);
    // Днём по цветку скользит солнечный блик.
    const glint = tod === "day" ? el("ellipse", { rx: C * 0.34, ry: C * 0.1, fill: "#fff", opacity: 0.4, filter: `url(#${uid}-soft)`, style: "pointer-events:none;mix-blend-mode:soft-light" }, svg) : null;
    // Туман: белая дымка поверх и две полосы, что медленно плывут.
    const fogBands: Element[] = [];
    if (wxSky === "fog") {
      el("circle", { cx: C, cy: C, r: C * 0.95, fill: `url(#${uid}-fog)`, style: "pointer-events:none" }, svg);
      for (let j = 0; j < 2; j++)
        fogBands.push(el("ellipse", { rx: C * 0.9, ry: C * 0.12, fill: "#fff", opacity: 0.7, filter: `url(#${uid}-soft)`, style: "pointer-events:none" }, svg));
    }
    // Гроза: вспышка молнии.
    const flash = wxSky === "storm" ? el("circle", { cx: C, cy: C, r: C * 1.05, fill: `url(#${uid}-fog)`, opacity: 0, style: "pointer-events:none" }, svg) : null;
    let nextFlash = 2;
    const fx = el("g", { style: "pointer-events:none" }, svg);
    const todFx = el("g", { style: "pointer-events:none" }, svg);
    // Касание лепестка: цветок качается, утром с него скатывается капля.
    let pokeAt = -1e9;
    const backs = Array.from({ length: N }, (_, i) => el("path", { fill: PHASE_COLOR[phaseOf(i + 1)] }, back));
    const fronts = Array.from({ length: N }, (_, i) => {
      const p = el("path", { role: "button", "aria-label": `${i + 1}-й день: ${TITLE[phaseOf(i + 1)]}`, fill: `url(#${uid}-${phaseOf(i + 1)})`, style: "cursor:pointer" }, front);
      p.addEventListener("click", () => {
        pokeAt = performance.now();
        pick({ day: i + 1 });
      });
      return p;
    });
    // Овуляция и сегодня — поверх соседей, чтобы их не перекрывало.
    if (ov >= 1 && ov <= N) front.appendChild(fronts[ov - 1]);
    if (day >= 1 && day <= N) front.appendChild(fronts[day - 1]);
    const veins = Array.from({ length: N }, () => el("path", { fill: "none", stroke: "#fff", "stroke-linecap": "round" }, veinsG));
    const STAMENS = 18;
    const stamens = Array.from({ length: STAMENS }, (_, i) =>
      el("circle", { fill: i % 3 === 0 ? PHASE_COLOR.ovulation : "#fbbf24", stroke: "#fff", "stroke-width": 0.8 * k0 }, stamenG),
    );

    const ph = phaseOf(day);
    const frac = (a: number, b: number) => (b > a ? (day - a) / (b - a) : 1);
    const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
    // «Жизнь цветка»: бутон в месячные, семена и увядание после овуляции, облетание в конце.
    const lifeOn = life && !waiting;
    // Задержка в «Жизни цветка»: старый цветок облетел, в центре зреет новый
    // бутон и с каждым днём задержки чуть набухает.
    const lifeWait = life && waiting;
    const budSwell = lifeWait ? 0.9 + Math.min(lateDays, 10) * 0.025 : 1;
    const budK = lifeWait ? 1 : !lifeOn ? 0 : ph === "period" ? 1 : ph === "follicular" ? clamp01(1 - frac(pl + 1, fs - 1) * 1.6) : 0;
    const ageK = lifeOn && ph === "luteal" ? clamp01(frac(fe + 1, N)) : 0;
    const seedK = lifeOn && ph === "luteal" ? 0.35 + 0.65 * ageK : 0;
    const fallK = lifeOn && ph === "luteal" ? (N - day <= 1 ? 0.5 : N - day === 2 ? 0.25 : 0) : 0;
    const growK = !lifeOn ? 1 : ph === "period" ? 0 : ph === "follicular" ? frac(pl + 1, fs - 1) : 1;
    const budG = el("g", { style: "pointer-events:none", opacity: budK }, svg);
    if (budK > 0) {
      for (let j = 0; j < 6; j++)
        el("path", { d: petalD(34 * k0, 9 * k0), transform: `translate(${C} ${C}) rotate(${j * 60 + 15}) translate(0 ${-R0 + 4 * k0})`, fill: "#6cc48a", stroke: "#fff", "stroke-width": 0.8 * k0 }, budG);
      for (let L = 0; L < 2; L++)
        for (let j = 0; j < 10; j++)
          el(
            "path",
            {
              d: petalCurlD((L ? 26 : 20) * k0, (L ? 15 : 13) * k0, 0.25),
              transform: `translate(${C} ${C}) rotate(${j * 36 + L * 18}) translate(0 ${-R0 + 3 * k0})`,
              fill: `url(#${uid}-bud)`,
              stroke: "#fff",
              "stroke-width": 0.9 * k0,
              opacity: L ? 0.85 : 1,
            },
            budG,
          );
    }
    const seedG = el("g", { style: "pointer-events:none" }, svg);
    if (seedK > 0) {
      const M = Math.round(30 + 90 * seedK);
      for (let j = 0; j < M; j++) {
        const r = R0 + (Math.sqrt(j / M) * (6 + 18 * seedK) - 1) * k0;
        const a = j * 2.39996;
        el("circle", { cx: C + Math.cos(a) * r, cy: C + Math.sin(a) * r, r: (1.4 + 1.4 * seedK) * k0, fill: seedK > 0.75 ? "#a8742a" : j % 5 === 0 ? PHASE_COLOR.ovulation : "#e0a43a" }, seedG);
      }
    }
    // Облетевшие лепестки (кроме сегодняшнего) — по одному и тому же правилу, без мигания.
    const gone = (i: number) => fallK > 0 && i + 1 !== day && ((i * 11) % N) / N < fallK;
    const open = waiting ? 0.8 : lifeOn ? (ph === "period" ? lerp(0.3, 0.42, frac(1, pl)) : ph === "follicular" ? lerp(0.48, 0.86, frac(pl + 1, fs - 1)) : ph === "ovulation" ? 1.08 : ph === "fertile" ? (day < ov ? lerp(0.88, 1, frac(fs, ov - 1)) : 0.98) : lerp(0.96, 0.86, ageK)) :
      ph === "period" ? lerp(0.56, 0.62, frac(1, pl))
      : ph === "follicular" ? lerp(0.64, 0.84, frac(pl + 1, fs - 1))
      : ph === "ovulation" ? 1.08
      : ph === "fertile" ? (day < ov ? lerp(0.86, 1, frac(fs, ov - 1)) : 0.98)
      : lerp(0.96, 0.62, frac(fe + 1, N));
    const curl = lifeOn ? (ph === "luteal" ? 0.12 * ageK : 0) : waiting ? 0.12 : ph === "period" ? lerp(0.35, 0.15, frac(1, pl)) : ph === "luteal" ? lerp(0, 0.6, frac(fe + 1, N)) : 0;
    const wide = lifeOn && ph === "luteal" ? 1 : waiting ? 0.92 : ph === "period" ? 0.74 : ph === "follicular" ? lerp(0.8, 0.98, frac(pl + 1, fs - 1)) : ph === "luteal" ? lerp(1, 0.78, frac(fe + 1, N)) : 1.04;
    // Вечером лепестки понемногу прикрываются, ночью смыкаются.
    const openT = open * (tod === "night" ? 0.72 : tod === "evening" ? 0.93 : 1) * (wxHot ? 0.95 : 1);
    const curlT = curl + (tod === "night" ? 0.3 : tod === "evening" ? 0.08 : 0);
    const bloomy = !waiting && (ph === "fertile" || ph === "ovulation");
    const shedding = !waiting && ph === "luteal" && N - day <= 5;
    const fluffy = lifeOn && ph === "luteal" && N - day <= 3;
    for (let i = 0; i < N; i++)
      if (gone(i)) {
        fronts[i].setAttribute("display", "none");
        backs[i].setAttribute("display", "none");
        veins[i].setAttribute("display", "none");
      }
    // Задержка: каждый её день окрашивает по лепестку по кругу.
    const todayK = waiting ? Math.min(lateDays, N) : day;
    if (waiting) for (let k = 1; k <= todayK; k++) fronts[k - 1].setAttribute("fill", `url(#${uid}-late)`);
    if (waiting) front.appendChild(fronts[todayK - 1]);
    const narrow = Math.sqrt(28 / Math.max(N, 24));

    type Part = { pollen: boolean; fluff?: boolean; mote?: boolean; rain?: boolean; ripple?: boolean; snow?: boolean; leaf?: boolean; x: number; y: number; vx: number; vy: number; life: number; r: number; rot: number; vr: number; c: string };
    let parts: Part[] = [];
    let raf = 0;
    const t0 = performance.now();
    let grow = reduce ? 1 : 0;
    // Кончики лепестков — для бабочки.
    const tips: { x: number; y: number; a: number }[] = [];
    // Капля, что скатывается: какая и когда начала.
    let roll = { i: -1, at: -99 };
    let nextRoll = 2.5;
    // Бабочка: прилетает, сидит на лепестке, улетает.
    let bf = { at: 1.2, from: { x: 0, y: 0 }, to: -1 };
    const frame = (now: number) => {
      const s = (now - t0) / 1000;
      // Утром цветок просыпается: раскрывается медленнее, из почти сомкнутого.
      grow = reduce ? 1 : Math.min(1, grow + (tod === "morning" ? 0.007 : 0.018));
      const g = easeOut(grow);
      const o = lerp(tod === "morning" ? 0.3 : 0.45, openT, g);
      const poke = reduce ? 0 : Math.max(0, 1 - (now - pokeAt) / 900);
      const sway = reduce
        ? 0
        : wxWindy
          ? Math.sin(s * 1.3) * 6 + Math.sin(s * 3.1) * 1.5 + poke * 5 * Math.sin(s * 11)
          : Math.sin(s * 0.7) * (tod === "day" ? 2.2 : tod === "night" ? 0.8 : 1.5) + poke * 5 * Math.sin(s * 11);
      for (let i = 0; i < N; i++) {
        const k = i + 1;
        const isToday = k === todayK;
        const past = waiting || k < day;
        const wave = reduce ? 1 : 1 + 0.03 * Math.sin(s * 1.6 - i * 0.45);
        const isOv = k === ov;
        // Возраст лепестка после овуляции: у каждого свой, чтобы сохли не разом.
        const age = lifeWait ? 0.85 : ageK > 0 ? clamp01(ageK * 1.5 - ((i * 7) % 10) * 0.05 - (past ? 0 : 0.1)) : 0;
        const len = (78 + (isToday ? 18 : 0) + (isOv ? 16 : 0)) * k0 * o * wave * (1 - 0.32 * age);
        const w = 15 * k0 * wide * (isToday ? 1.15 : isOv ? 1.25 : 1) * narrow * (1 - 0.25 * age);
        const twist = age * 0.9;
        // Пока бутон раскрывается, лепестки ещё закручены спиралью.
        const a = ((k - 0.5) / N) * 360 + curlT * 28 * g + sway + (1 - growK) * 40;
        const tr = `translate(${C} ${C}) rotate(${a}) translate(0 ${-R0 + 6 * k0})`;
        fronts[i].setAttribute("d", age > 0 ? petalCurlD(len, w, twist) : petalD(len, w));
        if (lifeWait) fronts[i].setAttribute("fill", `url(#${uid}-${phaseOf(k)}-dry)`);
        else if (life && !waiting) fronts[i].setAttribute("fill", `url(#${uid}-${phaseOf(k)}${age > 0.4 ? "-dry" : ""})`);
        fronts[i].setAttribute("transform", tr);
        fronts[i].setAttribute("opacity", String(lifeWait ? (isToday ? 0.75 : 0.45) : isToday || isOv ? 1 : past ? 1 : 0.5 + 0.12 * o));
        fronts[i].setAttribute("stroke", isToday || isOv ? "#fff" : "rgba(255,255,255,0.5)");
        fronts[i].setAttribute("stroke-width", String((isToday ? 2.5 : isOv ? 1.8 : 0.6) * k0));
        veins[i].setAttribute("d", `M0 ${-len * 0.14} Q ${w * 0.18 + twist * w * 0.5} ${-len * 0.5} ${twist * w * 1.1} ${-len * 0.8}`);
        veins[i].setAttribute("transform", tr);
        veins[i].setAttribute("stroke-opacity", String(past || isToday ? 0.5 : 0.25));
        veins[i].setAttribute("stroke-width", String(1.1 * k0));
        // Задний ряд — между днями, длиннее и шире: цветок пышнее.
        const ab = (k / N) * 360 + curlT * 34 * g + sway * 0.6;
        backs[i].setAttribute("d", age > 0 ? petalCurlD(len * 1.06 + 6 * k0, w * 1.25, twist * 0.7) : petalD(len * 1.06 + 6 * k0, w * 1.25));
        backs[i].setAttribute("transform", `translate(${C} ${C}) rotate(${ab}) translate(0 ${-R0 + 8 * k0})`);
        backs[i].setAttribute("opacity", String((lifeWait ? 0.05 : past ? 0.24 : 0.1) * g));
        const rad = (a * Math.PI) / 180;
        const reach = R0 - 6 * k0 + len;
        tips[i] = { x: C + Math.sin(rad) * reach, y: C - Math.cos(rad) * reach, a };
        const cap = caps[i];
        if (cap) {
          cap.setAttribute("transform", `${tr} translate(0 ${-len * 0.9}) scale(${g})`);
          cap.setAttribute("opacity", gone(i) ? "0" : "1");
        }
        const dew = dews[i];
        if (dew) {
          let pos = 0.6;
          let op = 1;
          if (i === roll.i) {
            const t = (s - roll.at) / 1.6;
            if (t < 1) {
              pos = 0.6 + 0.55 * t * t;
              op = 1 - t * t * t;
            } else op = Math.min(1, t - 1);
          }
          dew.setAttribute("transform", `${tr} translate(${w * 0.15} ${-len * pos}) rotate(${-a}) scale(${g})`);
          dew.setAttribute("opacity", String(gone(i) ? 0 : op));
        }
        if (isToday) {
          glow.setAttribute("d", petalD(len + 6 * k0, w + 4 * k0));
          glow.setAttribute("transform", tr);
        }
        if (isOv) {
          ovGlow.setAttribute("d", petalD(len + 8 * k0, w + 6 * k0));
          ovGlow.setAttribute("transform", tr);
          ovGlow.setAttribute("opacity", String((0.45 + (reduce ? 0 : 0.2 * Math.sin(s * 2.4))) * g));
          ovStarG.setAttribute("transform", tr);
          const tw = reduce ? 1 : 0.8 + 0.35 * Math.sin(s * 3.2);
          ovStar.setAttribute("transform", `translate(0 ${-len - 5 * k0}) rotate(${reduce ? 0 : s * 40}) scale(${k0 * tw * g})`);
        }
      }
      for (let i = 0; i < STAMENS; i++) {
        const a = (i / STAMENS) * Math.PI * 2 + s * 0.15;
        const rr = R0 + 2 * k0;
        stamens[i].setAttribute("cx", String(C + Math.cos(a) * rr));
        stamens[i].setAttribute("cy", String(C + Math.sin(a) * rr));
        stamens[i].setAttribute("r", String(seedK > 0 || budK > 0.5 ? 0 : (1.6 + 1.2 * o + (reduce ? 0 : 0.5 * Math.sin(s * 3 + i))) * k0 * g));
      }
      if (budK > 0) budG.setAttribute("transform", `translate(${C} ${C}) scale(${g * budSwell * (1 + (reduce ? 0 : 0.015 * Math.sin(s * 1.4)))}) translate(${-C} ${-C})`);
      if (seedK > 0) seedG.setAttribute("transform", `translate(${C} ${C}) rotate(${s * 4}) scale(${g}) translate(${-C} ${-C})`);
      aura.setAttribute("opacity", String(bloomy || waiting ? (0.55 + 0.15 * Math.sin(s * (waiting ? 1.2 : 2))) * g : 0));
      if (rays && !reduce) rays.setAttribute("transform", `${rays.getAttribute("transform")!.split(" rotate")[0]} rotate(${s * 6})`);
      if (!reduce) stars.forEach((st, j) => st.setAttribute("opacity", String(0.35 + 0.65 * Math.abs(Math.sin(s * (0.6 + (j % 4) * 0.2) + j)))));
      nightGlow?.setAttribute("opacity", String((0.35 + (reduce ? 0 : 0.15 * Math.sin(s * 1.1))) * g));
      if (glint) {
        const p = ((s * 0.06) % 1.4) - 0.7;
        glint.setAttribute("transform", `translate(${C + p * C * 1.6} ${C + p * C * 0.5}) rotate(-28)`);
      }
      // Облака плывут в пределах карточки и тают у её краёв.
      clouds.forEach((c, j) => {
        const span = C * 1.5;
        const x = ((((reduce ? 0.3 : s * (wxWindy ? 0.05 : 0.012)) + j * 0.37) % 1) + 1) % 1;
        c.setAttribute("transform", `translate(${C - span / 2 + x * span} ${C - C * (0.8 - j * 0.09)}) scale(${k0 * (1.15 - j * 0.15)})`);
        c.setAttribute("opacity", String((wxSky === "clouds" ? 0.92 : 0.85) * Math.min(1, Math.sin(Math.PI * x) * 3)));
      });
      fogBands.forEach((b, j) => {
        const x = Math.sin((reduce ? 1 : s) * 0.15 + j * 2) * C * 0.3;
        b.setAttribute("transform", `translate(${C + x} ${C + (j ? 0.35 : -0.25) * C})`);
      });
      if (flash && !reduce) {
        if (s > nextFlash) {
          nextFlash = s + 6 + Math.random() * 7;
          pokeAt = now;
        }
        const t = s - (nextFlash - 6);
        // Двойная вспышка в начале паузы.
        const f = Math.max(0, 1 - Math.abs(t) * 6) + Math.max(0, 1 - Math.abs(t - 0.25) * 8) * 0.7;
        flash.setAttribute("opacity", String(Math.min(1, f)));
      }
      if (dews.length && !reduce && (s > nextRoll || (poke > 0.95 && s - roll.at > 1.6))) {
        const have = dews.map((x, i) => (x && !gone(i) ? i : -1)).filter((i) => i >= 0);
        if (have.length) roll = { i: have[Math.floor(Math.random() * have.length)], at: s };
        nextRoll = s + 5 + Math.random() * 4;
      }
      let extra = "";
      if (tod === "day" && !overcast && !reduce && tips.length) {
        // Прилёт 2.4 с, сидит 6 с, улетает 2 с, нет её 10 с.
        const t = s - bf.at;
        if (bf.to < 0 && t >= 0) {
          const picks = tips.map((_, i) => i).filter((i) => !gone(i) && i + 1 !== day);
          const a = Math.random() * Math.PI * 2;
          bf = { at: bf.at, from: { x: C + Math.cos(a) * C * 1.5, y: C + Math.sin(a) * C * 1.5 - C * 0.4 }, to: picks[Math.floor(Math.random() * picks.length)] ?? 0 };
        }
        if (bf.to >= 0) {
          const tip = tips[bf.to];
          const land = { x: tip.x, y: tip.y };
          let x = land.x, y = land.y, rot = tip.a, f = 0.55 + 0.4 * Math.abs(Math.cos(s * 1.8));
          if (t < 2.4) {
            const q = easeOut(t / 2.4);
            x = lerp(bf.from.x, land.x, q) + Math.sin(t * 5) * 8 * k0 * (1 - q);
            y = lerp(bf.from.y, land.y, q) + Math.cos(t * 4) * 6 * k0 * (1 - q);
            rot = (Math.atan2(land.y - bf.from.y, land.x - bf.from.x) * 180) / Math.PI + 90;
            f = 0.2 + 0.8 * Math.abs(Math.cos(s * 14));
          } else if (t > 8.4) {
            const q = (t - 8.4) / 2;
            const away = { x: land.x + (land.x - C) * 2, y: land.y - C * 1.2 };
            x = lerp(land.x, away.x, q * q);
            y = lerp(land.y, away.y, q * q) + Math.sin(t * 5) * 6 * k0;
            rot = (Math.atan2(away.y - land.y, away.x - land.x) * 180) / Math.PI + 90;
            f = 0.2 + 0.8 * Math.abs(Math.cos(s * 14));
            if (q >= 1) bf = { at: s + 10, from: bf.from, to: -1 };
          }
          if (bf.to >= 0) extra += `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${k0 * 1.6})">${butterfly(uid, f)}</g>`;
        }
      }
      if (tod === "night" && !wet && wxSky !== "snow") {
        // Три светлячка кружат и мигают; от касания разлетаются шире.
        for (let j = 0; j < 4; j++) {
          const spread = 1 + poke * 0.25;
          const t = reduce ? j * 2 : s;
          const x = C + Math.sin(t * (0.21 + j * 0.07) + j * 2.1) * C * 0.78 * spread;
          const y = C + Math.sin(t * (0.17 + j * 0.05) + j * 1.3) * C * 0.62 * spread;
          const blink = reduce ? 1 : Math.pow(Math.max(0, Math.sin(s * 1.3 + j * 2.2)), 1.5) * 0.85 + 0.15;
          extra += `<circle cx="${x}" cy="${y}" r="${10 * k0}" fill="#facc15" opacity="${0.6 * blink}" filter="url(#${uid}-glow)"/><circle cx="${x}" cy="${y}" r="${2.8 * k0}" fill="#fefce8" opacity="${blink}"/>`;
        }
      }
      if (tod === "evening" && !overcast && !reduce && g > 0.6 && Math.random() < 0.06) {
        // Пылинки в закатном свете.
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * C * 0.85;
        parts.push({ pollen: false, mote: true, x: C + Math.cos(a) * r, y: C + Math.sin(a) * r, vx: (Math.random() - 0.3) * 0.25 * k0, vy: -(0.1 + Math.random() * 0.2) * k0, life: 1, r: (0.8 + Math.random() * 1.4) * k0, rot: 0, vr: 0, c: Math.random() < 0.5 ? "#fcd34d" : "#fdba74" });
      }
      if (!reduce && g > 0.5) {
        // Дождь: косые струйки; у земли — круги, как на лужах.
        if (wet && Math.random() < (wxSky === "storm" ? 1 : 0.55)) {
          for (let n = wxSky === "storm" ? 2 : 1; n > 0; n--)
            parts.push({ pollen: false, rain: true, x: C + (Math.random() * 1.6 - 0.6) * C, y: C - C * 0.95, vx: -(wxWindy ? 2.6 : 1.1) * k0, vy: (6 + Math.random() * 2) * k0, life: 1, r: C + C * (0.5 + Math.random() * 0.35), rot: 0, vr: 0, c: "" });
        }
        if (wxSky === "snow" && Math.random() < 0.3)
          parts.push({ pollen: false, snow: true, x: C + (Math.random() * 1.6 - (wxWindy ? 0.6 : 0.8)) * C, y: C - C * 0.95, vx: (wxWindy ? -1.2 : -0.2) * k0, vy: (0.5 + Math.random() * 0.5) * k0, life: 1, r: (1.6 + Math.random() * 1.8) * k0, rot: Math.random() * 6, vr: 0, c: "" });
        if (wxWindy && Math.random() < 0.02)
          parts.push({ pollen: false, leaf: true, x: C + C * 0.8, y: C + (Math.random() - 0.6) * C, vx: -(2.2 + Math.random()) * k0, vy: (Math.random() - 0.5) * 0.6 * k0, life: 1, r: 0, rot: Math.random() * 360, vr: 5 + Math.random() * 4, c: "" });
      }
      todFx.innerHTML = extra;


      if (!reduce && g > 0.6) {
        if (bloomy && Math.random() < (ph === "ovulation" ? 0.45 : 0.2)) {
          const a = Math.random() * Math.PI * 2;
          const sp = (0.6 + Math.random()) * k0;
          parts.push({ pollen: true, x: C + Math.cos(a) * R0, y: C + Math.sin(a) * R0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.2 * k0, life: 1, r: (1.5 + Math.random() * 2.2) * k0, rot: 0, vr: 0, c: Math.random() < 0.5 ? PHASE_COLOR.ovulation : "#fbbf24" });
        }
        if (fluffy && Math.random() < 0.025) {
          const a = Math.random() * Math.PI * 2;
          parts.push({ pollen: false, fluff: true, x: C + Math.cos(a) * R0 * 1.2, y: C + Math.sin(a) * R0 * 1.2, vx: (0.4 + Math.random() * 0.5) * k0, vy: -(0.3 + Math.random() * 0.4) * k0, life: 1, r: 0, rot: (Math.random() - 0.5) * 30, vr: (Math.random() - 0.5) * 0.6, c: "" });
        }
        if (shedding && Math.random() < 0.02 * (6 - (N - day))) {
          const k = Math.floor(Math.random() * N) + 1;
          const a = ((k - 0.5) / N) * Math.PI * 2 - Math.PI / 2;
          const rr = R0 + 50 * k0 * o;
          parts.push({ pollen: false, x: C + Math.cos(a) * rr, y: C + Math.sin(a) * rr, vx: (Math.random() - 0.5) * 0.6 * k0, vy: (0.5 + Math.random() * 0.5) * k0, life: 1, r: 0, rot: Math.random() * 360, vr: (Math.random() - 0.5) * 4, c: PHASE_COLOR[phaseOf(k)] });
        }
      }
      // У каждой капли своя «земля» (r) — круги расходятся по всей нижней части.
      for (const q of parts)
        if (q.rain && (q.y > q.r || q.x < C - C * 0.8)) {
          q.life = 0;
          parts.push({ pollen: false, ripple: true, x: q.x, y: q.y, vx: 0, vy: 0, life: 1, r: 0, rot: 0, vr: 0, c: "" });
        } else if ((q.snow || q.leaf) && (q.y > C + C * 0.9 || q.x < C - C * 0.82)) q.life = 0;
      parts = parts.filter((q) => (q.life -= q.pollen ? 0.012 : q.ripple ? 0.035 : q.rain || q.snow || q.leaf ? 0.001 : q.fluff || q.mote ? 0.004 : 0.006) > 0);
      fx.innerHTML = parts
        .map((q) => {
          q.x += q.vx;
          q.y += q.vy;
          if (q.rain) return `<path d="M0 0 l${q.vx * 1.6} ${q.vy * 1.6}" transform="translate(${q.x} ${q.y})" stroke="${wxSky === "storm" ? "#64748b" : "#7dd3fc"}" stroke-width="${1.3 * k0}" stroke-linecap="round" opacity=".7"/>`;
          if (q.ripple) return `<ellipse cx="${q.x}" cy="${q.y}" rx="${(2 + (1 - q.life) * 10) * k0}" ry="${(0.8 + (1 - q.life) * 3) * k0}" fill="none" stroke="#7dd3fc" stroke-width="${0.9 * k0}" opacity="${q.life * 0.8}"/>`;
          if (q.snow) {
            q.x += Math.sin(q.y / (14 * k0) + q.rot) * 0.4 * k0;
            return `<circle cx="${q.x}" cy="${q.y}" r="${q.r}" fill="#fff" stroke="#bfdbfe" stroke-width="${0.6 * k0}" opacity=".95"/>`;
          }
          if (q.leaf) {
            q.rot += q.vr;
            q.vy += Math.sin(q.x / (20 * k0)) * 0.03 * k0;
            return `<g transform="translate(${q.x} ${q.y}) rotate(${q.rot}) scale(${k0 * 1.2})">${LEAF}</g>`;
          }
          if (q.mote) return `<circle cx="${q.x}" cy="${q.y}" r="${q.r}" fill="${q.c}" opacity="${(4 * q.life * (1 - q.life) * 0.9).toFixed(2)}"/>`;
          if (!q.pollen) {
            q.rot += q.vr;
            q.vx += Math.sin(q.y / 20) * 0.02;
          }
          if (q.fluff) return `<g transform="translate(${q.x} ${q.y}) rotate(${q.rot}) scale(${k0 * 1.2})" opacity="${Math.min(1, q.life * 2)}">${FLUFF}</g>`;
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
  }, [N, day, fs, fe, ov, pl, size, late, lateDays, life, tod, wxSky, wxWindy, wxHot]);
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
