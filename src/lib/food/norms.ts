/**
 * Дневная норма калорий и БЖУ.
 *
 * Обмен в покое — по формуле Миффлина — Сан Жеора, умножаем на активность.
 * Похудеть — минус 15%, набрать — плюс 10%: мягко, без голодовок.
 * БЖУ — белок от веса (больше, когда худеют), жиры ~30% калорий, остальное
 * углеводы. Это ориентир, а не назначение врача.
 */
import { ACTIVITIES, type FoodSettings } from "./types";

export interface Norm {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  /** Посчитана по данным (true) или своя (false). */
  auto: boolean;
}

/** Хватает ли данных, чтобы посчитать норму самим. */
export const canCompute = (s: FoodSettings | null) =>
  !!s && !!s.sex && !!s.birth_year && !!s.height_cm && !!s.weight_kg;

export function normFor(s: FoodSettings | null, year = new Date().getFullYear()): Norm | null {
  if (!s) return null;
  const weight = s.weight_kg ?? 70;
  let kcal: number | null = s.kcal_target;
  if (!kcal && canCompute(s)) {
    const age = year - s.birth_year!;
    const bmr = 10 * weight + 6.25 * s.height_cm! - 5 * age + (s.sex === "male" ? 5 : -161);
    const k = ACTIVITIES.find((a) => a.id === s.activity)?.k ?? 1.375;
    const goal = s.goal === "lose" ? 0.85 : s.goal === "gain" ? 1.1 : 1;
    kcal = Math.round((bmr * k * goal) / 10) * 10;
  }
  if (!kcal) return null;
  const protein = Math.round(Math.min(weight * (s.goal === "lose" ? 1.6 : s.goal === "gain" ? 1.8 : 1.3), (kcal * 0.35) / 4));
  const fat = Math.round((kcal * 0.3) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, fat, carbs, auto: !s.kcal_target };
}

/** Сумма за список блюд. */
export function totals(list: { kcal: number; protein: number; fat: number; carbs: number }[]) {
  return list.reduce(
    (t, e) => ({ kcal: t.kcal + Number(e.kcal), protein: t.protein + Number(e.protein), fat: t.fat + Number(e.fat), carbs: t.carbs + Number(e.carbs) }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );
}

/** Пересчитать блюдо на другой вес: калории и БЖУ меняются пропорционально. */
export function scaleItem<T extends { grams: number | null; kcal: number; protein: number; fat: number; carbs: number }>(item: T, grams: number): T {
  if (!item.grams || item.grams <= 0) return { ...item, grams };
  const k = grams / item.grams;
  const r = (x: number) => Math.round(x * k * 10) / 10;
  return { ...item, grams, kcal: Math.round(item.kcal * k), protein: r(item.protein), fat: r(item.fat), carbs: r(item.carbs) };
}
