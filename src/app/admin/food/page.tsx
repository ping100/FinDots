"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";
import { Loader } from "@/components/Loader";
import { Denied, Problem } from "@/components/admin/shared";
import { AdminHeader } from "@/components/admin/Tools";
import { inputClass, inputStyle } from "@/components/ui";
import type { Product } from "@/lib/food/types";

type Row = Product & { status: "new" | "verified" | "rejected"; updated_at: string; checked_at: string | null };
type Tab = "queue" | "off" | "verified" | "rejected";
type Counts = Record<Tab, number>;

const TABS: { id: Tab; label: string }[] = [
  { id: "queue", label: "На проверке" },
  { id: "off", label: "Open Food Facts" },
  { id: "verified", label: "Проверено" },
  { id: "rejected", label: "Отклонено" },
];

const SOURCE: Record<Product["source"], string> = { user: "введён вручную", label: "с фото этикетки", off: "из Open Food Facts" };

/**
 * Модерация продуктов Yumdots. Люди добавляют продукты по штрихкоду в
 * общую базу; здесь их проверяют: одобренные у всех помечаются «Проверено
 * Dots», отклонённые пропадают из поиска (штрихкод можно добавить заново).
 * Кто добавил продукт, не хранится.
 */
export default function AdminFoodPage() {
  const [tab, setTab] = useState<Tab>("queue");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [denied, setDenied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    const db = createClient();
    const [list, c] = await Promise.all([db.rpc("admin_food_products", { p_status: tab }), db.rpc("admin_food_counts")]);
    setBusy(false);
    const err = list.error ?? c.error;
    if (err) {
      if (err.code === "42501") setDenied(true);
      else setProblem(err.message);
      return;
    }
    setRows((list.data ?? []) as Row[]);
    setCounts(c.data as Counts);
  }, [tab]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const act = async (barcode: string, status: Row["status"], fix?: Partial<Product>) => {
    setProblem(null);
    const { error } = await createClient().rpc("admin_food_product_set", {
      p_barcode: barcode,
      p_status: status,
      ...(fix
        ? { p_name: fix.name, p_brand: fix.brand ?? "", p_kcal: fix.kcal, p_protein: fix.protein, p_fat: fix.fat, p_carbs: fix.carbs, p_pack_grams: fix.pack_grams }
        : {}),
    });
    if (error) {
      setProblem(error.message);
      return;
    }
    // Убираем из списка сразу, счётчики догонят.
    setRows((prev) => (prev ? prev.filter((r) => r.barcode !== barcode || status === tab) : prev));
    void load();
  };

  if (denied) return <Denied />;

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <AdminHeader title="Продукты Yumdots" busy={busy} onRefresh={() => void load()} />
      <p className="mb-3 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
        Что люди добавили по штрихкоду. Одобренные у всех помечаются «Проверено Dots». Отклонённые пропадают из поиска. Кто добавил, не хранится.
      </p>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium"
            style={tab === t.id ? { background: "var(--accent)", color: "#fff" } : { background: "var(--surface)" }}
          >
            {t.label}
            {counts ? (
              <span className="rounded-full px-1.5 text-[0.6875rem] tabular-nums" style={{ background: tab === t.id ? "rgba(255,255,255,.25)" : "var(--surface-2)" }}>
                {counts[t.id]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {problem ? <Problem text={problem} /> : null}
      {rows === null ? (
        <Loader />
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-[0.875rem]" style={{ color: "var(--muted)" }}>
          {tab === "queue" ? "Новых продуктов нет, всё проверено 👌" : "Пусто"}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <ProductCard key={r.barcode} row={r} onAct={act} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductCard({ row, onAct }: { row: Row; onAct: (barcode: string, status: Row["status"], fix?: Partial<Product>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: row.name,
    brand: row.brand ?? "",
    kcal: String(row.kcal),
    protein: String(row.protein),
    fat: String(row.fat),
    carbs: String(row.carbs),
    pack: row.pack_grams ? String(row.pack_grams) : "",
  });
  const n = (s: string) => {
    const v = Number(s.replace(",", "."));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  // Белки, жиры и углеводы больше 100 г на 100 г или калории сильно не сходятся с БЖУ — подозрительно.
  const est = row.protein * 4 + row.fat * 9 + row.carbs * 4;
  const odd = row.protein + row.fat + row.carbs > 100 || (est > 0 && Math.abs(est - row.kcal) > Math.max(60, row.kcal * 0.3));
  const run = async (status: Row["status"], fix?: Partial<Product>) => {
    setBusy(true);
    try {
      await onAct(row.barcode, status, fix);
    } finally {
      setBusy(false);
    }
  };
  const field = (key: keyof typeof f, label: string, wide = false) => (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="mb-0.5 block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <input className={`${inputClass} !py-2 text-sm`} style={inputStyle} value={f[key]} onChange={(e) => setF((x) => ({ ...x, [key]: e.target.value }))} />
    </label>
  );

  return (
    <li className="money-card rounded-2xl p-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold leading-snug">{row.name}</p>
          <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            {[row.brand, row.barcode, SOURCE[row.source], new Date(row.updated_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })].filter(Boolean).join(" · ")}
          </p>
        </div>
        {row.status === "verified" ? (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold" style={{ background: "color-mix(in srgb, #22c55e 16%, transparent)", color: "#16a34a" }}>
            Проверено
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[0.8125rem] tabular-nums">
        <b>{row.kcal} ккал</b> · Б {row.protein} · Ж {row.fat} · У {row.carbs} <span style={{ color: "var(--muted)" }}>на 100 г</span>
        {row.pack_grams ? <span style={{ color: "var(--muted)" }}> · упаковка {row.pack_grams} г</span> : null}
      </p>
      {odd ? (
        <p className="mt-1 text-[0.6875rem] font-medium" style={{ color: "#d97706" }}>
          ⚠️ Калории не сходятся с БЖУ (по БЖУ ≈ {Math.round(est)} ккал), проверьте
        </p>
      ) : null}

      {editing ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {field("name", "Название", true)}
          {field("brand", "Марка")}
          {field("pack", "Упаковка, г")}
          {field("kcal", "Ккал")}
          {field("protein", "Белки")}
          {field("fat", "Жиры")}
          {field("carbs", "Углеводы")}
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        {editing ? (
          <>
            <button disabled={busy} onClick={() => setEditing(false)} className="rounded-xl px-3 py-2 text-[0.8125rem]" style={{ background: "var(--surface-2)" }}>
              Отмена
            </button>
            <button
              disabled={busy || !f.name.trim()}
              onClick={() =>
                void run("verified", { name: f.name.trim(), brand: f.brand.trim() || null, kcal: Math.round(n(f.kcal)), protein: n(f.protein), fat: n(f.fat), carbs: n(f.carbs), pack_grams: n(f.pack) || null })
              }
              className="flex-1 rounded-xl py-2 text-[0.8125rem] font-semibold text-white disabled:opacity-50"
              style={{ background: "#22c55e" }}
            >
              Сохранить и одобрить
            </button>
          </>
        ) : (
          <>
            {row.status !== "verified" ? (
              <button disabled={busy} onClick={() => void run("verified")} className="flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-[0.8125rem] font-semibold text-white disabled:opacity-50" style={{ background: "#22c55e" }}>
                <Icon name="check" size={14} /> Одобрить
              </button>
            ) : null}
            <button disabled={busy} onClick={() => setEditing(true)} className="flex items-center gap-1 rounded-xl px-3 py-2 text-[0.8125rem] disabled:opacity-50" style={{ background: "var(--surface-2)" }}>
              <Icon name="edit" size={13} /> Исправить
            </button>
            {row.status !== "rejected" ? (
              <button disabled={busy} onClick={() => void run("rejected")} className="flex items-center gap-1 rounded-xl px-3 py-2 text-[0.8125rem] disabled:opacity-50" style={{ background: "var(--surface-2)", color: "var(--danger)" }}>
                <Icon name="close" size={13} /> Отклонить
              </button>
            ) : (
              <button disabled={busy} onClick={() => void run("new")} className="flex-1 rounded-xl py-2 text-[0.8125rem] disabled:opacity-50" style={{ background: "var(--surface-2)" }}>
                Вернуть на проверку
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
