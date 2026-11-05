"use client";

import type { Unit } from "@/lib/food/units";

/** Переключатель «г / мл». */
export function UnitToggle({ value, onChange, small }: { value: Unit; onChange: (u: Unit) => void; small?: boolean }) {
  return (
    <span className="inline-flex shrink-0 rounded-full p-0.5" style={{ background: "var(--surface-2)" }} role="radiogroup" aria-label="Единица">
      {(["g", "ml"] as const).map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={value === u}
          onClick={() => onChange(u)}
          className={`rounded-full font-medium transition ${small ? "px-2 py-0.5 text-[0.6875rem]" : "px-2.5 py-1 text-[0.75rem]"}`}
          style={value === u ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
        >
          {u === "g" ? "г" : "мл"}
        </button>
      ))}
    </span>
  );
}
