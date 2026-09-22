"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import { tickLabel, type Bucket } from "@/lib/report";

/**
 * Графики нарисованы инлайновым SVG: библиотека ради двух форм потянула бы
 * в мобильный бандл больше, чем весь остальной экран.
 *
 * Цвета серий проверены на различимость при дальтонизме: привычная пара
 * «зелёный — красный» даёт ΔE 2.8 при пороге 8, то есть для протанопии и
 * дейтеранопии это один цвет. Бирюзовый против красного даёт 12.0.
 */
export const SERIES = {
  income: { name: "Доходы", color: "#0d9488" },
  expense: { name: "Расходы", color: "#ef4444" },
} as const;

const W = 320;
const H = 168;
const PAD = { left: 46, right: 8, top: 10, bottom: 22 };
const PLOT = {
  x0: PAD.left,
  x1: W - PAD.right,
  y0: PAD.top,
  y1: H - PAD.bottom,
};

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function Empty({ text }: { text: string }) {
  return (
    <div
      className="flex h-[150px] items-center justify-center rounded-2xl text-sm"
      style={{ background: "var(--surface-2)", color: "var(--muted)" }}
    >
      {text}
    </div>
  );
}

/** Подсказка по тапу: на телефоне это единственный способ узнать точное значение. */
function Tooltip({
  bucket,
  currency,
  mode,
}: {
  bucket: Bucket;
  currency: string;
  mode: "both" | "net";
}) {
  const net = bucket.income - bucket.expense;
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-0 w-max -translate-x-1/2 rounded-xl px-3 py-2 text-[11px] leading-snug shadow-lg"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="mb-0.5 font-semibold">{bucket.full}</div>
      {mode === "both" ? (
        <>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: SERIES.income.color }} />
            <span style={{ color: "var(--muted)" }}>Доходы</span>
            <span className="ml-auto tabular-nums">{formatMoney(bucket.income, currency)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: SERIES.expense.color }} />
            <span style={{ color: "var(--muted)" }}>Расходы</span>
            <span className="ml-auto tabular-nums">{formatMoney(bucket.expense, currency)}</span>
          </div>
        </>
      ) : (
        <div className="tabular-nums">{formatMoney(net, currency)}</div>
      )}
    </div>
  );
}

/** Общая подложка: сетка, подписи оси и слой, ловящий касания. */
function Frame({
  buckets,
  children,
  onPick,
  ticks,
  active,
}: {
  buckets: Bucket[];
  children: React.ReactNode;
  onPick: (index: number | null) => void;
  ticks: { y: number; label: string }[];
  active: number | null;
}) {
  const step = (PLOT.x1 - PLOT.x0) / Math.max(buckets.length, 1);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      className="block touch-none select-none"
      role="img"
      onPointerDown={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - box.left) / box.width) * W;
        const index = Math.floor((x - PLOT.x0) / step);
        onPick(index >= 0 && index < buckets.length ? index : null);
      }}
      onPointerLeave={() => onPick(null)}
    >
      {ticks.map((tick) => (
        <g key={tick.label + tick.y}>
          <line
            x1={PLOT.x0}
            x2={PLOT.x1}
            y1={tick.y}
            y2={tick.y}
            stroke="var(--border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <text x={PLOT.x0 - 6} y={tick.y + 3} textAnchor="end" fontSize="9" fill="var(--muted)">
            {tick.label}
          </text>
        </g>
      ))}

      {active != null && buckets[active] ? (
        <line
          x1={PLOT.x0 + step * (active + 0.5)}
          x2={PLOT.x0 + step * (active + 0.5)}
          y1={PLOT.y0}
          y2={PLOT.y1}
          stroke="var(--muted)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}

      {children}

      {buckets.map((bucket, i) =>
        bucket.label ? (
          <text
            key={bucket.key}
            x={PLOT.x0 + step * (i + 0.5)}
            y={H - 7}
            textAnchor="middle"
            fontSize="9"
            fill="var(--muted)"
          >
            {bucket.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** Доходы и расходы: две линии на одной оси — обе в одной валюте. */
export function IncomeExpenseChart({
  buckets,
  currency,
}: {
  buckets: Bucket[];
  currency: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  const peak = Math.max(...buckets.map((b) => Math.max(b.income, b.expense)), 0);
  if (peak === 0) return <Empty text="За этот период данных нет" />;

  const max = niceMax(peak);
  const step = (PLOT.x1 - PLOT.x0) / buckets.length;
  const x = (i: number) => PLOT.x0 + step * (i + 0.5);
  const y = (value: number) => PLOT.y1 - (value / max) * (PLOT.y1 - PLOT.y0);

  const line = (pick: (b: Bucket) => number) =>
    buckets.map((b, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(pick(b)).toFixed(1)}`).join(" ");

  const ticks = [0, 0.5, 1].map((share) => ({
    y: y(max * share),
    label: tickLabel(max * share),
  }));

  return (
    <div className="relative">
      <Frame buckets={buckets} onPick={setActive} ticks={ticks} active={active}>
        {(["income", "expense"] as const).map((key) => (
          <path
            key={key}
            d={line((b) => b[key])}
            fill="none"
            stroke={SERIES[key].color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {active != null && buckets[active]
          ? (["income", "expense"] as const).map((key) => (
              <circle
                key={key}
                cx={x(active)}
                cy={y(buckets[active][key])}
                r="4"
                fill={SERIES[key].color}
                stroke="var(--surface)"
                strokeWidth="2"
              />
            ))
          : null}
      </Frame>

      {active != null && buckets[active] ? (
        <Tooltip bucket={buckets[active]} currency={currency} mode="both" />
      ) : null}

      <div className="mt-1 flex justify-center gap-4 text-[11px]" style={{ color: "var(--muted)" }}>
        {(["income", "expense"] as const).map((key) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-full" style={{ background: SERIES[key].color }} />
            {SERIES[key].name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Доходы минус расходы: столбцы от нулевой линии, вверх и вниз. */
export function NetChart({ buckets, currency }: { buckets: Bucket[]; currency: string }) {
  const [active, setActive] = useState<number | null>(null);

  const values = buckets.map((b) => b.income - b.expense);
  const peak = Math.max(...values.map(Math.abs), 0);
  if (peak === 0) return <Empty text="За этот период данных нет" />;

  // Нулевую линию ставим по данным, а не по центру: если месяцы все в плюс,
  // нижняя половина графика пустовала бы, а столбцы были бы вдвое ниже.
  const rawTop = Math.max(0, ...values);
  const rawBottom = Math.abs(Math.min(0, ...values));
  const top = rawTop > 0 ? niceMax(rawTop) : 0;
  const bottom = rawBottom > 0 ? niceMax(rawBottom) : 0;
  const span = top + bottom || 1;
  const height = PLOT.y1 - PLOT.y0;
  const zero = PLOT.y0 + (top / span) * height;
  const scale = height / span;

  const step = (PLOT.x1 - PLOT.x0) / buckets.length;
  const width = Math.min(step - 2, 24);

  const ticks = [
    ...(top > 0 ? [{ y: PLOT.y0, label: tickLabel(top) }] : []),
    { y: zero, label: "0" },
    ...(bottom > 0 ? [{ y: PLOT.y1, label: tickLabel(-bottom) }] : []),
  ];

  return (
    <div className="relative">
      <Frame buckets={buckets} onPick={setActive} ticks={ticks} active={active}>
        {values.map((value, i) => {
          const bar = Math.abs(value) * scale;
          if (bar < 0.5) return null;
          const positive = value > 0;
          return (
            <rect
              key={buckets[i].key}
              x={PLOT.x0 + step * (i + 0.5) - width / 2}
              y={positive ? zero - bar : zero}
              width={width}
              height={bar}
              rx={Math.min(4, width / 2)}
              fill={positive ? SERIES.income.color : SERIES.expense.color}
              opacity={active == null || active === i ? 1 : 0.45}
            />
          );
        })}
      </Frame>

      {active != null && buckets[active] ? (
        <Tooltip bucket={buckets[active]} currency={currency} mode="net" />
      ) : null}
    </div>
  );
}

/** Структура расходов: одна полоса «часть от целого», хвост свёрнут в «Прочее». */
export function ShareBar({
  items,
  total,
  currency,
}: {
  items: { id: string; name: string; color: string; value: number }[];
  total: number;
  currency: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  if (total <= 0) return <Empty text="За этот период трат нет" />;

  const top = items.slice(0, 6);
  const rest = items.slice(6).reduce((sum, item) => sum + item.value, 0);
  const parts = rest > 0
    ? [...top, { id: "rest", name: "Прочее", color: "#64748b", value: rest }]
    : top;

  const shown = active ? parts.find((p) => p.id === active) : null;

  return (
    <div>
      {/* Разделяют сегменты не обводки, а зазоры цветом поверхности */}
      <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-lg">
        {parts.map((part) => (
          <button
            key={part.id}
            onClick={() => setActive(active === part.id ? null : part.id)}
            aria-label={part.name}
            style={{
              background: part.color,
              width: `${(part.value / total) * 100}%`,
              opacity: active && active !== part.id ? 0.4 : 1,
            }}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-[11px]" style={{ color: "var(--muted)" }}>
        {shown ? (
          <>
            {shown.name} — {formatMoney(shown.value, currency)} ·{" "}
            {Math.round((shown.value / total) * 100)}%
          </>
        ) : (
          "Нажмите на сегмент, чтобы увидеть долю"
        )}
      </p>
    </div>
  );
}
