"use client";

/**
 * «Значения на: 100 г / всю упаковку / N г» — на упаковке пищевая ценность
 * бывает на 100 г, на порцию или на всю пачку. Человек вписывает цифры как
 * есть, а в базу уходит пересчёт на 100 г.
 */
export type Base = { kind: "100" | "pack" | "custom"; grams: string };

export const BASE_100: Base = { kind: "100", grams: "" };

const n = (s: string) => {
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** На сколько грамм вписаны цифры; 0 — не указано. */
export function baseGrams(base: Base, pack: string): number {
  return base.kind === "100" ? 100 : base.kind === "pack" ? n(pack) : n(base.grams);
}

/** Пересчитать значение на 100 г. */
export function per100(value: number, grams: number): number {
  return grams > 0 ? Math.round(((value * 100) / grams) * 10) / 10 : value;
}

export function PerBasePicker({ base, onChange, pack }: { base: Base; onChange: (b: Base) => void; pack: string }) {
  const chip = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition active:scale-95 ${on ? "text-white" : ""}`;
  const style = (on: boolean) => (on ? { background: "var(--accent)" } : { background: "var(--surface-2)" });
  return (
    <div className="mb-2">
      <p className="mb-1.5 text-[0.75rem]" style={{ color: "var(--muted)" }}>
        Цифры на упаковке указаны
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button className={chip(base.kind === "100")} style={style(base.kind === "100")} onClick={() => onChange({ ...base, kind: "100" })}>
          на 100 г
        </button>
        <button className={chip(base.kind === "pack")} style={style(base.kind === "pack")} onClick={() => onChange({ ...base, kind: "pack" })}>
          на всю упаковку{n(pack) ? ` · ${n(pack)} г` : ""}
        </button>
        <label className={`${chip(base.kind === "custom")} flex items-center gap-1`} style={style(base.kind === "custom")}>
          на
          <input
            inputMode="decimal"
            className="w-12 rounded-md bg-transparent text-center outline-none"
            style={{ background: base.kind === "custom" ? "rgba(255,255,255,.2)" : "var(--surface)" }}
            placeholder="250"
            value={base.grams}
            onFocus={() => onChange({ ...base, kind: "custom" })}
            onChange={(e) => onChange({ kind: "custom", grams: e.target.value })}
          />
          г
        </label>
      </div>
      {base.kind === "pack" && !n(pack) ? (
        <p className="mt-1 text-[0.6875rem]" style={{ color: "var(--danger)" }}>
          Впишите вес упаковки
        </p>
      ) : null}
    </div>
  );
}
