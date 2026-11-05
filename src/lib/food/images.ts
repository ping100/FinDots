"use client";

import { createClient } from "@/lib/supabase/client";

export interface Candidate {
  url: string;
  source: "pixabay" | "pexels" | "off" | "openverse" | "wikimedia";
  title: string;
}

export const SOURCE_LABEL: Record<Candidate["source"], string> = {
  pixabay: "Pixabay",
  pexels: "Pexels",
  off: "Фото упаковки",
  openverse: "Openverse",
  wikimedia: "Wikimedia",
};

/** Варианты картинок для продукта (поиск идёт на сервере). */
export async function findImages(name: string, code: string, custom = false): Promise<{ query: string; stock: boolean; candidates: Candidate[] }> {
  const res = await fetch(`/api/admin/food-image?q=${encodeURIComponent(name)}&code=${encodeURIComponent(code)}${custom ? "&custom=1" : ""}`);
  const data = (await res.json().catch(() => null)) as { query?: string; stock?: boolean; candidates?: Candidate[]; error?: string } | null;
  if (!res.ok || !data?.candidates) throw new Error(data?.error ?? "Не получилось найти картинки");
  return { query: data.query ?? name, stock: !!data.stock, candidates: data.candidates };
}

/** Названия по-английски одним запросом (для автоподбора). */
export async function translate(names: string[]): Promise<(string | null)[]> {
  const res = await fetch("/api/admin/food-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ names }) }).catch(() => null);
  const data = res?.ok ? ((await res.json().catch(() => null)) as { en?: (string | null)[] } | null) : null;
  return data?.en?.length === names.length ? data.en : names.map(() => null);
}

/** Квадрат 240×240 по центру, JPEG: в списке картинка маленькая, весит ~15 КБ. */
async function square(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error("Картинка не открылась"));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const size = Math.min(240, side);
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("Не получилось сжать"))), "image/jpeg", 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Ссылка, скопированная из поиска картинок, часто ведёт не на саму картинку,
 * а на страницу Google или Яндекса с адресом картинки внутри — достаём его.
 */
export function imageLink(text: string): string | null {
  const t = text.trim();
  if (t.startsWith("data:image/")) return t;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  const inner = u.searchParams.get("imgurl") ?? u.searchParams.get("img_url") ?? u.searchParams.get("mediaurl");
  if (inner) return imageLink(inner) ?? null;
  return u.protocol === "https:" || u.protocol === "http:" ? u.href.replace(/^http:/, "https:") : null;
}

/** Сохранить картинку продукта: с найденной ссылки, вставленной ссылки или своё фото. Возвращает адрес. */
export async function saveImage(barcode: string, from: string | Blob, any = false): Promise<string> {
  let blob: Blob;
  if (typeof from === "string" && from.startsWith("data:image/")) blob = await (await fetch(from)).blob();
  else if (typeof from === "string") {
    const res = await fetch(`/api/admin/food-image?img=${encodeURIComponent(from)}${any ? "&any=1" : ""}`);
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Картинка не загрузилась");
    blob = await res.blob();
  } else blob = from;
  const small = await square(blob);
  const db = createClient();
  const path = `${barcode}.jpg`;
  const up = await db.storage.from("food-images").upload(path, small, { upsert: true, contentType: "image/jpeg", cacheControl: "31536000" });
  if (up.error) throw new Error(up.error.message);
  // Метка времени в адресе: новая картинка не застрянет в кэше телефона.
  const url = `${db.storage.from("food-images").getPublicUrl(path).data.publicUrl}?v=${Date.now().toString(36)}`;
  const { error } = await db.rpc("admin_food_product_image", { p_barcode: barcode, p_url: url });
  if (error) throw new Error(error.message);
  return url;
}

export async function removeImage(barcode: string) {
  const db = createClient();
  await db.storage.from("food-images").remove([`${barcode}.jpg`]);
  const { error } = await db.rpc("admin_food_product_image", { p_barcode: barcode, p_url: null });
  if (error) throw new Error(error.message);
}
