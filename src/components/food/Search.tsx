"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";
import type { DraftItem, FoodEntry, Product } from "@/lib/food/types";

/** Для поиска: регистр и «ё» не важны. */
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").trim();
const words = (q: string) => norm(q).split(/\s+/).filter(Boolean);
const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

/** Свои блюда: каждое название один раз, в последнем варианте, и сколько раз ели. */
export function ownDishes(entries: FoodEntry[]) {
  const map = new Map<string, { item: DraftItem; times: number; last: string }>();
  for (const e of entries) {
    const key = norm(e.name);
    const prev = map.get(key);
    const item: DraftItem = { name: e.name, grams: e.grams, kcal: Number(e.kcal), protein: Number(e.protein), fat: Number(e.fat), carbs: Number(e.carbs) };
    if (!prev) map.set(key, { item, times: 1, last: e.created_at });
    else {
      prev.times++;
      if (e.created_at >= prev.last) {
        prev.item = item;
        prev.last = e.created_at;
      }
    }
  }
  return [...map.values()];
}

/**
 * Результаты поиска в окне «Что вы съели?»: сначала своё (то, что уже
 * записывали, работает и без интернета), ниже общая база продуктов Dots,
 * проверенные первыми.
 */
export function FoodSearch({
  query,
  entries,
  onDish,
  onProduct,
  onText,
}: {
  query: string;
  entries: FoodEntry[];
  onDish: (it: DraftItem) => void;
  onProduct: (p: Product) => void;
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
          <ul className="mb-3 overflow-hidden rounded-2xl" style={{ background: "var(--surface-2)" }}>
            {own.map(({ item, times }, i) => (
              <li key={item.name} style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
                <button onClick={() => onDish(item)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition active:opacity-70">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-medium">{item.name}</span>
                    <span className="block text-[0.6875rem] tabular-nums" style={{ color: "var(--muted)" }}>
                      {item.grams ? `${item.grams} г · ` : ""}Б {fmt(item.protein)} · Ж {fmt(item.fat)} · У {fmt(item.carbs)}
                      {times > 1 ? ` · ели ${times} ${times % 10 >= 2 && times % 10 <= 4 && (times % 100 < 12 || times % 100 > 14) ? "раза" : "раз"}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[0.875rem] font-semibold tabular-nums" style={{ color: "var(--accent)" }}>
                    {Math.round(item.kcal)} ккал
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {products?.length ? (
        <>
          <Heading>Продукты</Heading>
          <ul className="mb-3 overflow-hidden rounded-2xl" style={{ background: "var(--surface-2)" }}>
            {products.map((p, i) => (
              <li key={p.barcode} style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
                <button onClick={() => onProduct(p)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition active:opacity-70">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[0.9375rem] font-medium">{p.name}</span>
                      {p.status === "verified" ? (
                        <span className="shrink-0" style={{ color: "#16a34a" }} title="Проверено Dots" aria-label="Проверено Dots">
                          <Icon name="check" size={13} />
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-[0.6875rem] tabular-nums" style={{ color: "var(--muted)" }}>
                      {p.brand ? `${p.brand} · ` : ""}на 100 г · Б {fmt(p.protein)} · Ж {fmt(p.fat)} · У {fmt(p.carbs)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[0.875rem] font-semibold tabular-nums" style={{ color: "var(--accent)" }}>
                      {Math.round(p.kcal)}
                    </span>
                    <span className="block text-[0.625rem]" style={{ color: "var(--muted)" }}>
                      ккал/100 г
                    </span>
                  </span>
                </button>
              </li>
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
        className="mt-1 flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition active:scale-[0.98]"
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

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 px-1 text-[0.75rem] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
      {children}
    </p>
  );
}
