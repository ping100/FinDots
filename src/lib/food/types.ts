/** Yumdots: что съедено и какая норма. */

import type { Unit } from "./units";

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";
export type Activity = "low" | "light" | "moderate" | "high" | "very_high";
export type Goal = "lose" | "keep" | "gain";
export type Source = "photo" | "text" | "manual" | "repeat" | "barcode";

export interface FoodEntry {
  id: string;
  user_id: string;
  day: string;
  meal: Meal;
  name: string;
  grams: number | null;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  source: Source;
  /** Граммы или миллилитры; пусто — по названию (unitOf). */
  unit?: Unit | null;
  created_at: string;
}

export interface FoodSettings {
  user_id: string;
  sex: "female" | "male" | null;
  birth_year: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity: Activity;
  goal: Goal;
  /** Своя норма; null — считаем по росту, весу и активности. */
  kcal_target: number | null;
}

/** Продукт по штрихкоду: КБЖУ на 100 г. */
export interface Product {
  barcode: string;
  name: string;
  brand: string | null;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  /** Вес упаковки, г — для «съел всю упаковку». */
  pack_grams: number | null;
  source: "off" | "user" | "label";
  unit?: Unit | null;
  /** Картинка для списка (своя в food-images или фото упаковки из Open Food Facts). */
  image_url?: string | null;
  /** verified — «Проверено Dots» (одобрил админ). */
  status?: "new" | "verified" | "rejected";
}

/** Блюдо, которое распознала нейросеть или ввёл человек, до сохранения. */
export interface DraftItem {
  name: string;
  grams: number | null;
  unit?: Unit | null;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export const MEALS: { id: Meal; label: string; emoji: string }[] = [
  { id: "breakfast", label: "Завтрак", emoji: "🍳" },
  { id: "lunch", label: "Обед", emoji: "🍲" },
  { id: "dinner", label: "Ужин", emoji: "🍝" },
  { id: "snack", label: "Перекус", emoji: "🍎" },
];

/** Приём пищи по часам: что, скорее всего, человек сейчас записывает. */
export function mealNow(h = new Date().getHours()): Meal {
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

export const ACTIVITIES: { id: Activity; label: string; hint: string; k: number }[] = [
  { id: "low", label: "Почти не двигаюсь", hint: "Сидячая работа, без спорта", k: 1.2 },
  { id: "light", label: "Немного", hint: "Прогулки, спорт 1–2 раза в неделю", k: 1.375 },
  { id: "moderate", label: "Средне", hint: "Спорт 3–5 раз в неделю", k: 1.55 },
  { id: "high", label: "Много", hint: "Тренировки почти каждый день", k: 1.725 },
  { id: "very_high", label: "Очень много", hint: "Физическая работа и спорт", k: 1.9 },
];

export const GOALS: { id: Goal; label: string; emoji: string }[] = [
  { id: "lose", label: "Похудеть", emoji: "📉" },
  { id: "keep", label: "Держать вес", emoji: "⚖️" },
  { id: "gain", label: "Набрать", emoji: "📈" },
];
