import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/food/types";

export const runtime = "nodejs";

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Продукт по штрихкоду: КБЖУ на 100 г и вес упаковки.
 *
 * Сначала — наша общая база (food_products: что люди в Dots уже находили
 * или сфотографировали с этикетки). Нет — Open Food Facts (открытая база,
 * без ключа). Найденное там сохраняем к себе: в следующий раз быстрее.
 */
export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get("code") ?? "").replace(/\D/g, "");
  if (!/^[0-9]{6,14}$/.test(code)) return NextResponse.json({ error: "Не похоже на штрихкод" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });

  // Отклонённый модерацией — как будто его нет: можно добавить заново.
  const own = await supabase.from("food_products").select("*").eq("barcode", code).neq("status", "rejected").maybeSingle();
  if (own.data) return NextResponse.json({ product: own.data as Product });

  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_ru,brands,nutriments,product_quantity`,
    { headers: { "User-Agent": "Dots/1.0 (dotsapp.vercel.app)" }, next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) },
  ).catch(() => null);
  const data = res?.ok ? ((await res.json().catch(() => null)) as { status?: number; product?: Record<string, unknown> } | null) : null;
  const p = data?.status === 1 ? data.product : null;
  const n = (p?.nutriments ?? {}) as Record<string, unknown>;
  // Калорий нет, а килоджоули есть — пересчитываем.
  const kcal = num(n["energy-kcal_100g"]) ?? (num(n["energy_100g"]) != null ? num(n["energy_100g"])! / 4.184 : null);
  const name = String(p?.product_name_ru || p?.product_name || "").trim().slice(0, 120);
  if (!p || kcal == null || !name) return NextResponse.json({ notFound: true, barcode: code });

  const product: Product = {
    barcode: code,
    name,
    brand: String(p.brands ?? "").split(",")[0].trim().slice(0, 80) || null,
    kcal: Math.round(Math.min(kcal, 950)),
    protein: r1(Math.min(num(n.proteins_100g) ?? 0, 100)),
    fat: r1(Math.min(num(n.fat_100g) ?? 0, 100)),
    carbs: r1(Math.min(num(n.carbohydrates_100g) ?? 0, 100)),
    pack_grams: num(p.product_quantity) && num(p.product_quantity)! <= 20000 ? num(p.product_quantity) : null,
    source: "off",
  };
  await supabase.rpc("food_product_add", {
    p_barcode: product.barcode, p_name: product.name, p_brand: product.brand, p_kcal: product.kcal, p_protein: product.protein,
    p_fat: product.fat, p_carbs: product.carbs, p_pack_grams: product.pack_grams, p_source: "off",
  });
  return NextResponse.json({ product });
}

/** Сохранить продукт, которого не было: с этикетки или введённый вручную. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  const b = (await request.json().catch(() => null)) as Partial<Product> | null;
  const code = String(b?.barcode ?? "").replace(/\D/g, "");
  const name = String(b?.name ?? "").trim().slice(0, 120);
  const kcal = num(b?.kcal);
  if (!/^[0-9]{6,14}$/.test(code) || !name || kcal == null || kcal > 950) {
    return NextResponse.json({ error: "Нужны название и калории на 100 г" }, { status: 400 });
  }
  // Первый добавивший остаётся: тот же штрихкод не перезаписывается.
  const { data: result, error } = await supabase.rpc("food_product_add", {
    p_barcode: code, p_name: name, p_brand: b?.brand ?? null, p_kcal: Math.round(kcal),
    p_protein: r1(Math.min(num(b?.protein) ?? 0, 100)), p_fat: r1(Math.min(num(b?.fat) ?? 0, 100)), p_carbs: r1(Math.min(num(b?.carbs) ?? 0, 100)),
    p_pack_grams: num(b?.pack_grams) && num(b?.pack_grams)! <= 20000 ? num(b?.pack_grams) : null,
    p_source: b?.source === "label" ? "label" : "user",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "P0001" ? 429 : 500 });
  if (result === "exists") {
    const { data } = await supabase.from("food_products").select("*").eq("barcode", code).maybeSingle();
    return NextResponse.json({ ok: true, existed: true, product: data as Product | null });
  }
  return NextResponse.json({ ok: true });
}
