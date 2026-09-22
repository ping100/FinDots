export type TextScale = "small" | "medium" | "large";

/**
 * Коэффициент применяется сразу к двум вещам: к базовому размеру шрифта на
 * html (весь текст задан в rem и подтягивается сам) и к диаметру кружков,
 * которые в rem не выразить — размер иконки внутри SVG задаётся числом.
 */
export const TEXT_SCALES: { id: TextScale; label: string; hint: string; factor: number }[] = [
  { id: "small", label: "Мелкий", hint: "больше помещается на экран", factor: 0.92 },
  { id: "medium", label: "Средний", hint: "по умолчанию", factor: 1 },
  { id: "large", label: "Большой", hint: "крупные цифры, четыре кружка в ряд", factor: 1.18 },
];

export function scaleFactor(scale: TextScale | undefined): number {
  return TEXT_SCALES.find((item) => item.id === scale)?.factor ?? 1;
}

/** На крупном размере кружки шире, и пятый в ряд уже не помещается. */
export function gridColumns(scale: TextScale | undefined): number {
  return scale === "large" ? 4 : 5;
}
