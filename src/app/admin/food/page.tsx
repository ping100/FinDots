"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";
import { Loader } from "@/components/Loader";
import { Denied, Problem } from "@/components/admin/shared";
import { AdminHeader } from "@/components/admin/Tools";
import { Sheet, inputClass, inputStyle } from "@/components/ui";
import { FoodPic } from "@/components/food/FoodPic";
import { SOURCE_LABEL, findImages, imageLink, removeImage, saveImage, translate, type Candidate } from "@/lib/food/images";
import type { Product } from "@/lib/food/types";
import { BASE_100, PerBasePicker, baseGrams, per100, type Base } from "@/components/food/PerBase";

type Row = Product & { status: "new" | "verified" | "rejected"; updated_at: string; checked_at: string | null };
type Tab = "queue" | "all" | "noimage" | "off" | "verified" | "rejected";
type Counts = Record<Tab, number>;

const TABS: { id: Tab; label: string }[] = [
  { id: "queue", label: "На проверке" },
  { id: "all", label: "Все" },
  { id: "noimage", label: "Без картинки" },
  { id: "off", label: "Open Food Facts" },
  { id: "verified", label: "Проверено" },
  { id: "rejected", label: "Отклонено" },
];

/** Код 99… выдаётся продуктам без штрихкода (их добавляет админ). */
const noCode = (c: string) => /^99[0-9]{12}$/.test(c);
const nrm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

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
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState<Row | null>(null);
  const [stocksOpen, setStocksOpen] = useState(false);
  const stocks = useStocks();
  const [auto, setAuto] = useState<{ done: number; total: number; found: number } | null>(null);
  const stopAuto = useRef(false);

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

  const shown = useMemo(() => {
    const ws = nrm(q).split(/\s+/).filter(Boolean);
    if (!rows || !ws.length) return rows;
    return rows.filter((r) => ws.every((w) => nrm(`${r.name} ${r.brand ?? ""} ${r.barcode}`).includes(w)));
  }, [rows, q]);

  const setImage = (barcode: string, url: string | null) => setRows((prev) => (prev ? prev.map((r) => (r.barcode === barcode ? { ...r, image_url: url } : r)) : prev));

  // Автоподбор: каждому продукту без картинки — первый найденный вариант
  // (фото упаковки, если есть). Потом можно пройтись и заменить неудачные.
  const runAuto = async () => {
    const list = (rows ?? []).filter((r) => !r.image_url);
    if (!list.length) return;
    stopAuto.current = false;
    let found = 0;
    setAuto({ done: 0, total: list.length, found: 0 });
    // Переводим пачками по 40: один запрос к нейросети вместо сорока.
    const en: (string | null)[] = [];
    for (let i = 0; i < list.length; i += 40) en.push(...(await translate(list.slice(i, i + 40).map((r) => r.name))));
    for (let i = 0; i < list.length && !stopAuto.current; i++) {
      const r = list[i];
      try {
        const { candidates } = await findImages(en[i] ?? r.name, r.barcode, true);
        for (const c of candidates.slice(0, 3)) {
          try {
            const url = await saveImage(r.barcode, c.url);
            setImage(r.barcode, url);
            found++;
            break;
          } catch {
            // Эта не загрузилась — пробуем следующую.
          }
        }
      } catch {
        // Не нашлось — пропускаем, можно выбрать вручную.
      }
      setAuto({ done: i + 1, total: list.length, found });
    }
    setAuto(null);
    void load();
  };

  if (denied) return <Denied />;

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <AdminHeader title="Продукты Yumdots" busy={busy} onRefresh={() => void load()} />
      <p className="mb-3 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
        Общая база: что люди добавили по штрихкоду и что вы добавили сами. Одобренные у всех помечаются «Проверено Dots», отклонённые пропадают из поиска. Нажмите на картинку, чтобы её поменять. Кто добавил, не хранится.
      </p>

      <StocksLine keys={stocks.keys} onOpen={() => setStocksOpen(true)} />

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

      <div className="mb-3 flex gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3" style={{ background: "var(--surface)" }}>
          <Icon name="search" size={15} style={{ color: "var(--muted)" }} />
          <input className="min-w-0 flex-1 bg-transparent py-2 text-[0.875rem] outline-none" placeholder="Поиск: название, марка, код" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button onClick={() => setAdding(true)} className="flex shrink-0 items-center gap-1 rounded-xl px-3 text-[0.8125rem] font-semibold text-white" style={{ background: "var(--accent)" }}>
          <Icon name="plus" size={14} /> Продукт
        </button>
      </div>

      {tab === "noimage" && rows?.length ? (
        <div className="money-card mb-3 rounded-2xl p-3">
          {auto ? (
            <>
              <p className="text-[0.8125rem] font-medium tabular-nums">
                Подбираю картинки: {auto.done} из {auto.total}, нашлось {auto.found}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${(auto.done / auto.total) * 100}%`, background: "var(--accent)" }} />
              </div>
              <button onClick={() => (stopAuto.current = true)} className="mt-2 text-[0.75rem]" style={{ color: "var(--muted)" }}>
                Остановить
              </button>
            </>
          ) : (
            <>
              <p className="mb-2 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
                Каждому продукту поставлю первую найденную картинку: фото упаковки, если оно есть, иначе свободное фото из интернета. Неудачные потом замените вручную.
              </p>
              <button onClick={() => void runAuto()} className="w-full rounded-xl py-2 text-[0.8125rem] font-semibold text-white" style={{ background: "var(--accent)" }}>
                Подобрать картинки всем ({rows.length})
              </button>
            </>
          )}
        </div>
      ) : null}

      {problem ? <Problem text={problem} /> : null}
      {shown === null ? (
        <Loader />
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-[0.875rem]" style={{ color: "var(--muted)" }}>
          {q ? "Ничего не нашлось" : tab === "queue" ? "Новых продуктов нет, всё проверено 👌" : tab === "noimage" ? "У всех продуктов есть картинки 👌" : "Пусто"}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((r) => (
            <ProductCard key={r.barcode} row={r} onAct={act} onPicture={() => setPicking(r)} />
          ))}
        </ul>
      )}

      <StocksSheet open={stocksOpen} onClose={() => setStocksOpen(false)} keys={stocks.keys} onChanged={stocks.reload} />
      <ImagePicker
        onStocks={() => {
          setPicking(null);
          setStocksOpen(true);
        }}
        row={picking}
        onClose={() => setPicking(null)}
        onSaved={(url) => {
          if (picking) setImage(picking.barcode, url);
          setPicking(null);
          if (tab === "noimage") void load();
        }}
      />
      <NewProduct
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(row) => {
          setAdding(false);
          setPicking(row);
          void load();
        }}
      />
    </div>
  );
}

function ProductCard({ row, onAct, onPicture }: { row: Row; onAct: (barcode: string, status: Row["status"], fix?: Partial<Product>) => Promise<void>; onPicture: () => void }) {
  const [editing, setEditing] = useState(false);
  // Человек мог вписать цифры не на 100 г, а на упаковку — тут это поправить.
  const [base, setBase] = useState<Base>(BASE_100);
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
  const gBase = baseGrams(base, f.pack);
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
      <div className="flex items-start gap-2.5">
        <button onClick={onPicture} aria-label="Картинка" className="relative shrink-0 transition active:scale-95">
          <FoodPic src={row.image_url} name={row.name} size={52} />
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ background: "var(--accent)" }}>
            <Icon name={row.image_url ? "edit" : "plus"} size={11} />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold leading-snug">{row.name}</p>
          <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            {[row.brand, noCode(row.barcode) ? "без штрихкода" : row.barcode, SOURCE[row.source], new Date(row.updated_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })].filter(Boolean).join(" · ")}
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
        <div className="mt-3">
          <PerBasePicker base={base} onChange={setBase} pack={f.pack} />
          {gBase && gBase !== 100 ? (
            <p className="mb-2 text-[0.75rem] tabular-nums" style={{ color: "var(--accent)" }}>
              Сохранится на 100 г: {Math.round(per100(n(f.kcal), gBase))} ккал · Б {per100(n(f.protein), gBase)} · Ж {per100(n(f.fat), gBase)} · У {per100(n(f.carbs), gBase)}
            </p>
          ) : null}
        </div>
      ) : null}
      {editing ? (
        <div className="mt-1 grid grid-cols-2 gap-2">
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
              disabled={busy || !f.name.trim() || !gBase || per100(n(f.kcal), gBase) > 950}
              onClick={() =>
                void run("verified", {
                  name: f.name.trim(),
                  brand: f.brand.trim() || null,
                  kcal: Math.round(per100(n(f.kcal), gBase)),
                  protein: per100(n(f.protein), gBase),
                  fat: per100(n(f.fat), gBase),
                  carbs: per100(n(f.carbs), gBase),
                  pack_grams: n(f.pack) || null,
                })
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

/** Выбор картинки: найденные варианты, свой запрос или своё фото. */
function ImagePicker({ row, onClose, onSaved, onStocks }: { row: Row | null; onClose: () => void; onSaved: (url: string | null) => void; onStocks: () => void }) {
  const [query, setQuery] = useState("");
  const [stock, setStock] = useState(true);
  const [link, setLink] = useState("");

  // «Вставить»: ссылка из поля, иначе то, что скопировали — картинка или ссылка.
  const paste = async () => {
    setProblem(null);
    if (link.trim()) {
      const u = imageLink(link);
      if (!u) return setProblem("Это не похоже на ссылку на картинку");
      return void pick(u, true, "web");
    }
    try {
      const items = (await navigator.clipboard?.read?.()) ?? [];
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith("image/"));
        if (type) return void pick(await it.getType(type), true, "web");
      }
    } catch {
      // Браузер не дал прочитать картинку — попробуем текст.
    }
    try {
      const text = (await navigator.clipboard?.readText?.()) ?? "";
      const u = imageLink(text);
      if (u) return void pick(u, true, "web");
    } catch {
      // Нет доступа к буферу.
    }
    setProblem("Не нашёл скопированную картинку. Нажмите на фото и удерживайте, выберите «Скопировать» или «Скопировать ссылку», либо вставьте ссылку в поле");
  };
  const [list, setList] = useState<Candidate[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const file = useRef<HTMLInputElement | null>(null);

  const search = useCallback(
    async (q: string, custom: boolean) => {
      if (!row) return;
      setList(null);
      setProblem(null);
      try {
        const r = await findImages(q, row.barcode, custom);
        setQuery(r.query);
        setStock(r.stock);
        setList(r.candidates);
      } catch (e) {
        setProblem(e instanceof Error ? e.message : String(e));
        setList([]);
      }
    },
    [row],
  );

  useEffect(() => {
    if (!row) return;
    setSaving(null);
    setLink("");
    void search(row.name, false);
  }, [row, search]);

  const pick = async (from: string | Blob, any = false, mark?: string) => {
    if (!row || saving) return;
    setSaving(mark ?? (typeof from === "string" ? from : "file"));
    setProblem(null);
    try {
      onSaved(await saveImage(row.barcode, from, any));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Sheet open={!!row} title="Картинка продукта" onClose={onClose}>
      {row ? (
        <div className="pb-4">
          <div className="mb-3 flex items-center gap-3">
            <FoodPic src={row.image_url} name={row.name} size={56} />
            <div className="min-w-0">
              <p className="truncate text-[0.9375rem] font-semibold">{row.name}</p>
              <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                {row.image_url ? "Нажмите на вариант ниже, чтобы заменить" : "Пока без картинки, в списке стоит значок"}
              </p>
            </div>
          </div>
          <form
            className="mb-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim()) void search(query.trim(), true);
            }}
          >
            <input className={`${inputClass} !py-2 text-sm`} style={inputStyle} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Что искать" />
            <button type="submit" className="shrink-0 rounded-xl px-3 text-[0.8125rem] font-medium" style={{ background: "var(--surface-2)" }}>
              Искать
            </button>
          </form>
          {problem ? <Problem text={problem} /> : null}
          {!stock ? (
            <button onClick={onStocks} className="mb-3 w-full rounded-2xl px-3.5 py-2.5 text-left text-[0.75rem] leading-snug" style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)" }}>
              ✨ <b>Красивые фото еды</b> появятся после подключения Pixabay или Pexels. Это бесплатно, займёт пару минут. <span style={{ color: "var(--accent)" }}>Подключить →</span>
            </button>
          ) : null}
          {list === null ? (
            <Loader />
          ) : list.length ? (
            <div className="grid grid-cols-3 gap-2">
              {list.map((c) => (
                <button
                  key={c.url}
                  onClick={() => void pick(c.url)}
                  disabled={!!saving}
                  className="relative aspect-square overflow-hidden rounded-2xl transition active:scale-95 disabled:opacity-60"
                  style={{ background: "var(--surface-2)" }}
                  title={c.title}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.url} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).closest("button")!.style.display = "none")} />
                  <span className="absolute inset-x-0 bottom-0 truncate px-1.5 py-0.5 text-[0.5625rem] text-white" style={{ background: "rgba(0,0,0,.45)" }}>
                    {SOURCE_LABEL[c.source]}
                  </span>
                  {saving === c.url ? (
                    <span className="absolute inset-0 flex items-center justify-center text-[0.75rem] font-semibold text-white" style={{ background: "rgba(0,0,0,.45)" }}>
                      Сохраняю…
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-[0.8125rem]" style={{ color: "var(--muted)" }}>
              Ничего не нашлось. Попробуйте другой запрос, лучше по-английски, или загрузите своё фото
            </p>
          )}
          <div className="mt-4 rounded-2xl p-3.5" style={{ background: "var(--surface-2)" }}>
            <p className="text-[0.875rem] font-semibold">🌐 Найти в интернете самому</p>
            <p className="mb-2.5 mt-0.5 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
              Откройте поиск и выберите фото. Откройте его покрупнее, нажмите и удерживайте, выберите «Скопировать». Вернитесь сюда и нажмите «Вставить».
            </p>
            <div className="mb-2 grid grid-cols-2 gap-2">
              {[
                { name: "Яндекс Картинки", url: `https://yandex.ru/images/search?text=${encodeURIComponent(`${row.name} ${row.brand ?? ""}`.trim())}` },
                { name: "Google Картинки", url: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${row.name} ${row.brand ?? ""}`.trim())}` },
              ].map((x) => (
                <a key={x.name} href={x.url} target="_blank" rel="noreferrer" className="rounded-xl py-2 text-center text-[0.8125rem] font-medium" style={{ background: "var(--surface)", color: "var(--accent)" }}>
                  {x.name} ↗
                </a>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className={`${inputClass} !py-2 text-sm`}
                style={inputStyle}
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="или вставьте ссылку на фото"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                disabled={!!saving}
                onClick={() => void paste()}
                className="shrink-0 rounded-xl px-3.5 text-[0.8125rem] font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--accent)" }}
              >
                {saving === "web" ? "Сохраняю…" : "Вставить"}
              </button>
            </div>
            <p className="mt-2 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
              У фото из обычного поиска обычно есть автор. Для своих это нормально, но если приложение станет публичным, надёжнее фото с Pixabay и Pexels.
            </p>
          </div>
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0])} />
          <div className="mt-3 flex gap-2">
            <button onClick={() => file.current?.click()} disabled={!!saving} className="flex-1 rounded-xl py-2.5 text-[0.8125rem] font-medium disabled:opacity-60" style={{ background: "var(--surface-2)" }}>
              {saving === "file" ? "Сохраняю…" : "📷 Своё фото"}
            </button>
            {row.image_url ? (
              <button
                disabled={!!saving}
                onClick={async () => {
                  try {
                    await removeImage(row.barcode);
                    onSaved(null);
                  } catch (e) {
                    setProblem(e instanceof Error ? e.message : String(e));
                  }
                }}
                className="rounded-xl px-3 py-2.5 text-[0.8125rem] disabled:opacity-60"
                style={{ background: "var(--surface-2)", color: "var(--danger)" }}
              >
                Убрать
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
            Картинка сожмётся до 240×240 и сохранится у нас. Фото с Pixabay, Pexels, Openverse и Wikimedia разрешено использовать бесплатно.
          </p>
        </div>
      ) : null}
    </Sheet>
  );
}

/** Новый продукт в общую базу, сразу проверенный. Штрихкод не обязателен. */
function NewProduct({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (row: Row) => void }) {
  const empty = { name: "", brand: "", code: "", pack: "", kcal: "", protein: "", fat: "", carbs: "" };
  const [f, setF] = useState(empty);
  const [base, setBase] = useState<Base>(BASE_100);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setF(empty);
    setBase(BASE_100);
    setProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const n = (s: string) => {
    const v = Number(s.replace(",", ".").replace(/\s/g, ""));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  const g = baseGrams(base, f.pack);
  const kcal = g ? Math.round(per100(n(f.kcal), g)) : 0;
  const ok = f.name.trim() && n(f.kcal) > 0 && g && kcal <= 950 && (!f.code || /^[0-9]{6,14}$/.test(f.code));
  const field = (key: keyof typeof f, label: string, wide = false, numeric = true) => (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="mb-0.5 block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <input
        inputMode={numeric ? "decimal" : "text"}
        className={`${inputClass} !py-2 text-sm`}
        style={inputStyle}
        value={f[key]}
        onChange={(e) => setF((x) => ({ ...x, [key]: key === "code" ? e.target.value.replace(/\D/g, "").slice(0, 14) : e.target.value }))}
      />
    </label>
  );
  const save = async () => {
    if (!ok || saving) return;
    setSaving(true);
    setProblem(null);
    const row = {
      name: f.name.trim(),
      brand: f.brand.trim() || null,
      kcal,
      protein: per100(n(f.protein), g!),
      fat: per100(n(f.fat), g!),
      carbs: per100(n(f.carbs), g!),
      pack_grams: n(f.pack) || null,
    };
    const { data, error } = await createClient().rpc("admin_food_product_create", {
      p_barcode: f.code || null,
      p_name: row.name,
      p_brand: row.brand,
      p_kcal: row.kcal,
      p_protein: Math.min(row.protein, 100),
      p_fat: Math.min(row.fat, 100),
      p_carbs: Math.min(row.carbs, 100),
      p_pack_grams: row.pack_grams,
    });
    setSaving(false);
    if (error) {
      setProblem(error.message);
      return;
    }
    onCreated({ ...row, barcode: data as string, source: "user", status: "verified", image_url: null, updated_at: new Date().toISOString(), checked_at: null });
  };
  return (
    <Sheet
      open={open}
      title="Новый продукт"
      onClose={onClose}
      footer={
        <div className="pb-2">
          <button disabled={!ok || saving} onClick={() => void save()} className="w-full rounded-2xl py-3 text-[0.9375rem] font-semibold text-white disabled:opacity-50" style={{ background: "#22c55e" }}>
            {saving ? "Сохраняю…" : "Добавить в базу"}
          </button>
        </div>
      }
    >
      <div className="pb-3">
        <p className="mb-2 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
          Сразу попадёт в общую базу с отметкой «Проверено Dots». Штрихкод нужен только для упаковок: яблоку или домашнему блюду он не нужен. После сохранения подберём картинку.
        </p>
        {problem ? <Problem text={problem} /> : null}
        <div className="mb-2 grid grid-cols-2 gap-2">
          {field("name", "Название", true, false)}
          {field("brand", "Марка", false, false)}
          {field("code", "Штрихкод, если есть")}
          {field("pack", "Вес упаковки или порции, г", true)}
        </div>
        <PerBasePicker base={base} onChange={setBase} pack={f.pack} />
        <div className="grid grid-cols-2 gap-2">
          {field("kcal", "Ккал")}
          {field("protein", "Белки")}
          {field("fat", "Жиры")}
          {field("carbs", "Углеводы")}
        </div>
        {g && g !== 100 && n(f.kcal) > 0 ? (
          <p className="mt-2 text-[0.75rem] tabular-nums" style={{ color: "var(--accent)" }}>
            Сохранится на 100 г: {kcal} ккал · Б {per100(n(f.protein), g)} · Ж {per100(n(f.fat), g)} · У {per100(n(f.carbs), g)}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

type StockKey = { provider: "pixabay" | "pexels"; configured: boolean; hint: string | null };

function useStocks() {
  const [keys, setKeys] = useState<StockKey[] | null>(null);
  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/photo-keys").catch(() => null);
    const d = res?.ok ? ((await res.json().catch(() => null)) as { keys?: StockKey[] } | null) : null;
    setKeys(d?.keys ?? []);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { keys, reload };
}

const STOCKS: { id: StockKey["provider"]; name: string; url: string; steps: string[] }[] = [
  {
    id: "pixabay",
    name: "Pixabay",
    url: "https://pixabay.com/api/docs/",
    steps: [
      "Откройте страницу по кнопке ниже и войдите (можно через Google)",
      "На той же странице найдите раздел «Parameters»: в строке key зелёным написан ваш ключ",
      "Скопируйте его и вставьте сюда",
    ],
  },
  {
    id: "pexels",
    name: "Pexels",
    url: "https://www.pexels.com/api/",
    steps: [
      "Откройте страницу по кнопке ниже, нажмите «Get Started» и войдите (можно через Google)",
      "Заполните коротко: название Dots, описание «картинки продуктов в приложении учёта калорий»",
      "Ключ появится сразу, скопируйте его и вставьте сюда",
    ],
  },
];

function StocksLine({ keys, onOpen }: { keys: StockKey[] | null; onOpen: () => void }) {
  if (!keys) return null;
  const on = STOCKS.filter((s) => keys.some((k) => k.provider === s.id && k.configured));
  return on.length ? (
    <button onClick={onOpen} className="mb-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[0.75rem]" style={{ background: "var(--surface)" }}>
      <span>✨ Фото для продуктов: {on.map((s) => s.name).join(" и ")}</span>
      <span className="ml-auto" style={{ color: "var(--accent)" }}>
        Настроить
      </span>
    </button>
  ) : (
    <button onClick={onOpen} className="money-card mb-3 w-full rounded-2xl p-3 text-left">
      <p className="text-[0.875rem] font-semibold">✨ Подключите красивые фото еды</p>
      <p className="mt-0.5 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
        Pixabay и Pexels: бесплатные фотостоки с профессиональными фото продуктов. Нужен бесплатный ключ, это пара минут.
      </p>
      <p className="mt-1.5 text-[0.75rem] font-semibold" style={{ color: "var(--accent)" }}>
        Подключить →
      </p>
    </button>
  );
}

function StocksSheet({ open, onClose, keys, onChanged }: { open: boolean; onClose: () => void; keys: StockKey[] | null; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setDraft({});
    setProblem(null);
    setDone(null);
  }, [open]);
  const save = async (provider: string, key: string | null) => {
    setBusy(provider);
    setProblem(null);
    setDone(null);
    const res = await fetch("/api/admin/photo-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, key }) }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { error?: string } | null;
    setBusy(null);
    if (!res?.ok) {
      setProblem(d?.error ?? "Не получилось сохранить");
      return;
    }
    setDraft((x) => ({ ...x, [provider]: "" }));
    setDone(key ? "Подключено, теперь в поиске картинок будут фото оттуда" : "Отключено");
    await onChanged();
  };
  return (
    <Sheet open={open} title="Фото для продуктов" onClose={onClose}>
      <div className="pb-4">
        <p className="mb-3 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Подключите один или оба. Фото оттуда можно использовать бесплатно и без подписи автора. Ключ хранится зашифрованным, его видит только сервер.
        </p>
        {problem ? <Problem text={problem} /> : null}
        {done ? (
          <p className="mb-3 rounded-2xl px-3.5 py-2.5 text-[0.8125rem]" style={{ background: "color-mix(in srgb, #22c55e 14%, transparent)", color: "#16a34a" }}>
            ✓ {done}
          </p>
        ) : null}
        <div className="space-y-3">
          {STOCKS.map((st) => {
            const k = keys?.find((x) => x.provider === st.id && x.configured);
            return (
              <div key={st.id} className="rounded-2xl p-3.5" style={{ background: "var(--surface-2)" }}>
                <div className="mb-1.5 flex items-center gap-2">
                  <p className="text-[0.9375rem] font-semibold">{st.name}</p>
                  {k ? (
                    <span className="rounded-full px-2 py-0.5 text-[0.625rem] font-semibold" style={{ background: "color-mix(in srgb, #22c55e 16%, transparent)", color: "#16a34a" }}>
                      подключён {k.hint}
                    </span>
                  ) : null}
                </div>
                {!k ? (
                  <ol className="mb-2.5 list-decimal space-y-0.5 pl-4 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
                    {st.steps.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ol>
                ) : null}
                <div className="flex gap-2">
                  <input
                    className={`${inputClass} !py-2 text-sm`}
                    style={inputStyle}
                    value={draft[st.id] ?? ""}
                    onChange={(e) => setDraft((x) => ({ ...x, [st.id]: e.target.value }))}
                    placeholder={k ? "Новый ключ, если нужно заменить" : "Вставьте ключ"}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    disabled={!draft[st.id]?.trim() || !!busy}
                    onClick={() => void save(st.id, draft[st.id].trim())}
                    className="shrink-0 rounded-xl px-3 text-[0.8125rem] font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--accent)" }}
                  >
                    {busy === st.id ? "Проверяю…" : "Сохранить"}
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[0.75rem]">
                  <a href={st.url} target="_blank" rel="noreferrer" className="font-medium" style={{ color: "var(--accent)" }}>
                    {k ? "Открыть" : "Получить ключ"} на {st.name} ↗
                  </a>
                  {k ? (
                    <button disabled={!!busy} onClick={() => void save(st.id, null)} className="ml-auto" style={{ color: "var(--danger)" }}>
                      Отключить
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
