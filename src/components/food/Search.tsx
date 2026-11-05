"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";
import type { DraftItem, FoodEntry, Meal, Product } from "@/lib/food/types";
import { itemFrom } from "./Barcode";
import { FoodPic } from "./FoodPic";
import { defaultPortion, ul, unitOf } from "@/lib/food/units";

/** Для поиска: регистр и «ё» не важны. */
export const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").trim();
const words = (q: string) => norm(q).split(/\s+/).filter(Boolean);
const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");
const times = (n: number) => `${n} ${n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "раза" : "раз"}`;

export interface Dish {
  item: DraftItem;
  times: number;
  /** Сколько раз ели в этот приём пищи — для «Часто». */
  inMeal: number;
  last: string;
}

/** Свои блюда: каждое название один раз, в последнем варианте. */
export function ownDishes(entries: FoodEntry[], meal?: Meal): Dish[] {
  const map = new Map<string, Dish>();
  for (const e of entries) {
    const key = norm(e.name);
    const prev = map.get(key);
    const item: DraftItem = { name: e.name, grams: e.grams, unit: e.unit ?? null, kcal: Number(e.kcal), protein: Number(e.protein), fat: Number(e.fat), carbs: Number(e.carbs) };
    const here = meal && e.meal === meal ? 1 : 0;
    if (!prev) map.set(key, { item, times: 1, inMeal: here, last: e.created_at });
    else {
      prev.times++;
      prev.inMeal += here;
      if (e.created_at >= prev.last) {
        prev.item = item;
        prev.last = e.created_at;
      }
    }
  }
  return [...map.values()];
}

/** Порция продукта по умолчанию: упаковка, если она не больше 300 г, иначе 100 г. */
export const portion = (p: Product) => defaultPortion(p);

// Общая база продуктов: грузим один раз за сессию, проверенные первыми.
let cache: Product[] | null = null;
export function useProducts(enabled: boolean) {
  const [list, setList] = useState<Product[] | null>(cache);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!enabled || cache) return;
    if (!navigator.onLine) {
      setOffline(true);
      return;
    }
    let alive = true;
    void (async () => {
      const { data } = await createClient()
        .from("food_products")
        .select("*")
        .neq("status", "rejected")
        .order("status", { ascending: false })
        .order("name")
        .limit(400);
      if (!alive) return;
      if (data) cache = data as Product[];
      setList((data as Product[] | null) ?? []);
      setOffline(!data && !navigator.onLine);
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);
  return { products: list, offline };
}

/** Картинки к своим блюдам: если блюдо записано из продукта — берём его картинку. */
export function usePics(products: Product[] | null) {
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products ?? []) {
      if (!p.image_url) continue;
      m.set(norm(itemFrom(p, 100).name), p.image_url);
      if (!m.has(norm(p.name))) m.set(norm(p.name), p.image_url);
    }
    return m;
  }, [products]);
}

/** Строка списка: картинка, название, подробности, калории и плюсик «добавить». */
export function FoodRow({
  pic,
  name,
  badge,
  sub,
  kcal,
  kcalHint,
  onOpen,
  onAdd,
}: {
  pic?: string | null;
  name: string;
  badge?: boolean;
  sub: string;
  kcal: number;
  kcalHint?: string;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 1200);
    return () => clearTimeout(t);
  }, [added]);
  return (
    <li className="flex items-center gap-1">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left transition active:opacity-70">
        <FoodPic src={pic} name={name} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1">
            <span className="truncate text-[0.9375rem] font-medium">{name}</span>
            {badge ? (
              <span className="shrink-0" style={{ color: "#16a34a" }} aria-label="Проверено Dots">
                <Icon name="check" size={13} />
              </span>
            ) : null}
          </span>
          <span className="block truncate text-[0.6875rem] tabular-nums" style={{ color: "var(--muted)" }}>
            <b className="font-semibold" style={{ color: "var(--accent)" }}>
              {Math.round(kcal)} ккал
            </b>
            {kcalHint ? ` ${kcalHint}` : ""} · {sub}
          </span>
        </span>
      </button>
      <button
        onClick={() => {
          onAdd();
          setAdded(true);
          navigator.vibrate?.(15);
        }}
        aria-label={`Добавить «${name}»`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-90"
        style={added ? { background: "#22c55e", color: "#fff" } : { background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}
      >
        <Icon name={added ? "check" : "plus"} size={17} />
      </button>
    </li>
  );
}

export function DishRow({ d, pic, onOpen, onAdd }: { d: Dish; pic?: string; onOpen: () => void; onAdd: () => void }) {
  const it = d.item;
  return (
    <FoodRow
      pic={pic}
      name={it.name}
      kcal={it.kcal}
      kcalHint={it.grams ? `за ${it.grams} ${ul(unitOf(it))}` : undefined}
      sub={`Б ${fmt(it.protein)} · Ж ${fmt(it.fat)} · У ${fmt(it.carbs)}${d.times > 1 ? ` · ели ${times(d.times)}` : ""}`}
      onOpen={onOpen}
      onAdd={onAdd}
    />
  );
}

export function ProductRow({ p, onOpen, onAdd }: { p: Product; onOpen: () => void; onAdd: () => void }) {
  return (
    <FoodRow
      pic={p.image_url}
      name={p.name}
      badge={p.status === "verified"}
      kcal={p.kcal}
      kcalHint={`на 100 ${ul(unitOf(p))}`}
      sub={`${p.brand ? `${p.brand} · ` : ""}Б ${fmt(p.protein)} · Ж ${fmt(p.fat)} · У ${fmt(p.carbs)}`}
      onOpen={onOpen}
      onAdd={onAdd}
    />
  );
}

export function Heading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-0.5 mt-2 text-[0.75rem] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
      {children}
    </p>
  );
}

/**
 * Результаты поиска в окне «Что вы съели?»: сначала своё (то, что уже
 * записывали, работает и без интернета), ниже общая база продуктов Dots,
 * проверенные первыми.
 */
export function FoodSearch({
  query,
  entries,
  pics,
  onDish,
  onAddDish,
  onProduct,
  onAddProduct,
  onText,
}: {
  query: string;
  entries: FoodEntry[];
  pics: Map<string, string>;
  onDish: (it: DraftItem) => void;
  onAddDish: (it: DraftItem) => void;
  onProduct: (p: Product) => void;
  onAddProduct: (p: Product) => void;
  onText: () => void;
}) {
  const ws = useMemo(() => words(query), [query]);

  const own = useMemo(() => {
    if (!ws.length) return [];
    return ownDishes(entries)
      .filter((d) => ws.every((w) => norm(d.item.name).includes(w)))
      .sort((a, b) => {
        // Начинается с запроса — выше, потом что ели чаще.
        const sa = norm(a.item.name).startsWith(ws[0]) ? 1 : 0;
        const sb = norm(b.item.name).startsWith(ws[0]) ? 1 : 0;
        return sb - sa || b.times - a.times || b.last.localeCompare(a.last);
      })
      .slice(0, 8);
  }, [entries, ws]);

  const [products, setProducts] = useState<Product[] | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    setProducts(null);
    // Запятые и скобки ломают фильтр запроса, «%» и «_» — шаблон поиска.
    const clean = ws.map((w) => w.replace(/[,()%_*\\"]/g, "")).filter((w) => w.length > 0);
    if (!clean.length || clean.join("").length < 2) return;
    if (!navigator.onLine) {
      setOffline(true);
      return;
    }
    setOffline(false);
    let alive = true;
    const t = window.setTimeout(async () => {
      let q = createClient().from("food_products").select("*").neq("status", "rejected");
      for (const w of clean) q = q.or(`name.ilike.%${w}%,brand.ilike.%${w}%`);
      const { data, error } = await q.order("status", { ascending: false }).order("updated_at", { ascending: false }).limit(12);
      if (!alive) return;
      if (error) setOffline(!navigator.onLine);
      setProducts((data as Product[] | null) ?? []);
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [ws]);

  const loading = products === null && !offline && ws.join("").length >= 2;
  const nothing = !own.length && products !== null && !products.length;

  return (
    <div className="pb-3">
      {own.length ? (
        <>
          <Heading>Вы уже ели</Heading>
          <ul>
            {own.map((d) => (
              <DishRow key={d.item.name} d={d} pic={pics.get(norm(d.item.name))} onOpen={() => onDish(d.item)} onAdd={() => onAddDish(d.item)} />
            ))}
          </ul>
        </>
      ) : null}

      {products?.length ? (
        <>
          <Heading>Продукты</Heading>
          <ul>
            {products.map((p) => (
              <ProductRow key={p.barcode} p={p} onOpen={() => onProduct(p)} onAdd={() => onAddProduct(p)} />
            ))}
          </ul>
        </>
      ) : null}

      {loading ? (
        <p className="py-2 text-center text-[0.8125rem]" style={{ color: "var(--muted)" }}>
          Ищу в базе продуктов…
        </p>
      ) : null}
      {offline ? (
        <p className="py-2 text-center text-[0.75rem]" style={{ color: "var(--muted)" }}>
          Без интернета ищу только среди того, что вы уже ели
        </p>
      ) : null}
      {nothing ? (
        <p className="py-2 text-center text-[0.8125rem]" style={{ color: "var(--muted)" }}>
          Ничего не нашлось
        </p>
      ) : null}

      {/* Не нашли — можно сразу посчитать словами то, что ввели. */}
      <button
        onClick={onText}
        className="mt-2 flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition active:scale-[0.98]"
        style={{ border: "1.5px dashed var(--border)" }}
      >
        <span className="text-xl">💬</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.875rem] font-medium">Посчитать «{query.trim()}»</span>
          <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            Нейросеть оценит обычную порцию
          </span>
        </span>
      </button>
    </div>
  );
}
