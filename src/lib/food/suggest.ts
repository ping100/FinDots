"use client";

import { createClient } from "@/lib/supabase/client";
import type { FoodEntry } from "./types";
import { unitOf } from "./units";

/** Запись → значения на 100 г (или 100 мл). Без веса посчитать нельзя. */
export function per100Of(e: Pick<FoodEntry, "grams" | "kcal" | "protein" | "fat" | "carbs">) {
  const g = Number(e.grams);
  if (!(g > 0)) return null;
  const k = 100 / g;
  const r = (x: number) => Math.round(Number(x) * k * 10) / 10;
  const kcal = Math.round(Number(e.kcal) * k);
  // Больше 950 ккал на 100 г не бывает — значит, вес записан неверно.
  if (kcal > 950) return null;
  return { kcal, protein: Math.min(r(e.protein), 100), fat: Math.min(r(e.fat), 100), carbs: Math.min(r(e.carbs), 100) };
}

/** Предложить своё блюдо в общую базу: уйдёт админу на проверку. */
export async function suggestEntry(e: FoodEntry): Promise<"added" | "exists"> {
  const p = per100Of(e);
  if (!p) throw new Error("Нужен вес, чтобы посчитать на 100 г");
  const { data, error } = await createClient().rpc("food_product_suggest", {
    p_name: e.name.trim(),
    p_kcal: p.kcal,
    p_protein: p.protein,
    p_fat: p.fat,
    p_carbs: p.carbs,
    p_pack_grams: Math.round(Number(e.grams)),
    p_unit: unitOf(e),
  });
  if (error) throw new Error(error.message);
  return data === "exists" ? "exists" : "added";
}
