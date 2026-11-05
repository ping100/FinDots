import type { DraftItem } from "./types";

/** Кубик рафинада или чайная ложка сахара: около 5 г, 20 ккал, 5 г углеводов. */
export const CUBE = { grams: 5, kcal: 20, carbs: 5 };

// Во что кладут сахар. Если сахар уже в названии («чай с сахаром») — он учтён.
const SWEETABLE = /(^|[^а-яё])(чай|кофе|какао|капучино|латте|американо|эспрессо|цикори|матча|глинтвейн|компот|морс)/;

export function canSweeten(name: string) {
  const s = name.toLowerCase().replace(/ё/g, "е");
  return SWEETABLE.test(s) && !s.includes("сахар");
}

/** Поставить n кубиков: калории и углеводы меняются на разницу. */
export function withSugar(it: DraftItem, n: number): DraftItem {
  const d = n - (it.sugar ?? 0);
  return { ...it, sugar: n, kcal: Math.max(0, it.kcal + d * CUBE.kcal), carbs: Math.max(0, Math.round((it.carbs + d * CUBE.carbs) * 10) / 10) };
}

/** Название для записи: «Чай черный с сахаром (2 куб.)». */
export function sugarName(it: DraftItem) {
  return it.sugar ? `${it.name.trim()} с сахаром (${it.sugar} куб.)` : it.name;
}
