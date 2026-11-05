"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { Button, Sheet, inputClass, inputStyle } from "@/components/ui";
import { scaleItem, totals } from "@/lib/food/norms";
import { MEALS, type DraftItem, type Meal, type Product, type Source } from "@/lib/food/types";
import { useFood } from "./DataProvider";
import { BarcodeFlow, itemFrom } from "./Barcode";
import { UnitToggle } from "./UnitToggle";
import { CUBE, canSweeten, sugarName, withSugar } from "@/lib/food/sugar";
import { guessUnit, ul, unitOf, type Unit } from "@/lib/food/units";
import { DishRow, FoodSearch, ProductRow, norm, ownDishes, portion, usePics, useProducts } from "./Search";

type ListTab = "often" | "recent" | "products";
const LIST_TABS: { id: ListTab; label: string }[] = [
  { id: "often", label: "Часто" },
  { id: "recent", label: "Недавнее" },
  { id: "products", label: "Продукты" },
];

type Step = "pick" | "text" | "manual" | "busy" | "review" | "barcode" | "product";

/** Сжать фото до ~1024 px по длинной стороне: нейросети хватает, трафика меньше. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error("Не получилось открыть фото"));
      i.src = url;
    });
    const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const num = (s: string) => {
  const n = Number(s.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

/**
 * Добавить еду: фото тарелки (распознаёт нейросеть), словами, вручную или
 * из недавнего. Всё распознанное можно поправить перед сохранением: вес
 * пересчитывает калории и БЖУ.
 */
export function AddFood({ open, day, meal: startMeal, onClose, onSaved }: { open: boolean; day: string; meal: Meal; onClose: () => void; onSaved: (kcal: number) => void }) {
  const { entries, addEntries } = useFood();
  const [step, setStep] = useState<Step>("pick");
  const [meal, setMeal] = useState<Meal>(startMeal);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [source, setSource] = useState<Source>("manual");
  const [photo, setPhoto] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [comment, setComment] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Product | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("pick");
    setMeal(startMeal);
    setItems([]);
    setPhoto(null);
    setText("");
    setComment("");
    setProblem(null);
    setQuery("");
    setChosen(null);
    setShown(40);
    setTab(entries.length ? "often" : "products");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startMeal]);

  const [tab, setTab] = useState<ListTab>("often");
  const [shown, setShown] = useState(40);
  const { products, offline } = useProducts(open);
  const pics = usePics(products);
  // Часто — что чаще ели именно в этот приём пищи; Недавнее — свежие первыми.
  const dishes = useMemo(() => {
    const all = ownDishes(entries, meal);
    if (tab === "recent") return all.sort((a, b) => b.last.localeCompare(a.last)).slice(0, 40);
    return all.sort((a, b) => b.inMeal - a.inMeal || b.times - a.times || b.last.localeCompare(a.last)).slice(0, 40);
  }, [entries, meal, tab]);

  /** Добавить в список, не уходя из выбора; источник — по первому блюду. */
  const addItem = (it: DraftItem, src: Source) => {
    setItems((prev) => {
      if (!prev.length) setSource(src);
      return [...prev, it];
    });
    setComment("");
  };

  const recognize = async (payload: { image?: string; text?: string }, src: Source) => {
    setProblem(null);
    setStep("busy");
    try {
      const res = await fetch("/api/food-analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => null)) as { items?: DraftItem[]; comment?: string; error?: string } | null;
      if (!res.ok || !data?.items) throw new Error(data?.error ?? "Не получилось распознать, попробуйте ещё раз");
      if (!data.items.length) throw new Error(data.comment || "Не нашёл на фото еды. Попробуйте другое фото или опишите словами");
      // Уже что-то в списке (нажали «Добавить ещё») — дописываем, а не заменяем.
      if (!items.length) setSource(src);
      setItems((prev) => [...prev, ...data.items!]);
      setComment(data.comment ?? "");
      setStep("review");
    } catch (e) {
      setProblem(navigator.onLine ? (e instanceof Error ? e.message : String(e)) : "Без интернета распознать не получится. Добавьте вручную");
      setStep(src === "photo" ? "pick" : "text");
    }
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = await shrink(file);
      setPhoto(data);
      await recognize({ image: data, text: text.trim() || undefined }, "photo");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };

  // Такое же блюдо в этот приём пищи меньше 5 минут назад — скорее всего, повтор.
  const [dupOk, setDupOk] = useState(false);
  useEffect(() => setDupOk(false), [items, meal]);
  const dup = useMemo(() => {
    const since = Date.now() - 5 * 60_000;
    return items.find((it) =>
      entries.some(
        (e) => e.day === day && e.meal === meal && e.name.toLowerCase() === it.name.trim().toLowerCase() && Math.abs(Number(e.kcal) - it.kcal) < 1 && Date.parse(e.created_at) > since,
      ),
    );
  }, [items, entries, day, meal]);

  const save = async () => {
    // Сахар к напитку — в название: «Чай черный с сахаром (2 куб.)».
    const list = items.filter((x) => x.name.trim()).map((x) => ({ ...x, name: sugarName(x) }));
    if (!list.length || saving) return;
    if (dup && !dupOk) {
      setDupOk(true);
      return;
    }
    setSaving(true);
    try {
      await addEntries(list, meal, day, source);
      onSaved(totals(list).kcal);
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const sum = totals(items);
  const title = step === "review" ? "Проверьте, что получилось" : step === "text" ? "Опишите словами" : step === "manual" ? "Вручную" : step === "barcode" ? "Штрихкод" : step === "product" ? (chosen && unitOf(chosen) === "ml" ? "Сколько выпили" : "Сколько съели") : "Что вы съели?";

  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      footer={
        step === "review" ? (
          <div className="flex gap-2 pb-2">
            <Button
              variant="ghost"
              className="!w-auto shrink-0 px-5"
              onClick={() => {
                setItems([]);
                setStep("pick");
              }}
            >
              Назад
            </Button>
            <Button onClick={() => void save()} disabled={saving || !items.length}>
              {saving ? "Сохраняю…" : dup && dupOk ? "Да, записать ещё раз" : `Сохранить · ${Math.round(sum.kcal)} ккал`}
            </Button>
          </div>
        ) : step === "pick" && items.length ? (
          <div className="pb-2">
            <Button onClick={() => setStep("review")}>
              Готово · {items.length} · {Math.round(sum.kcal)} ккал
            </Button>
          </div>
        ) : null
      }
    >
      {/* Приём пищи — всегда виден: сразу понятно, куда запишется. */}
      <div className="mb-2.5 grid grid-cols-4 gap-1.5">
        {MEALS.map((m) => (
          <button
            key={m.id}
            onClick={() => setMeal(m.id)}
            aria-pressed={meal === m.id}
            className="flex items-center justify-center gap-1 rounded-full py-2 text-[0.75rem] font-medium transition active:scale-95"
            style={meal === m.id ? { background: "var(--accent)", color: "#fff" } : { background: "var(--surface-2)" }}
          >
            <span className="text-[0.875rem] leading-none">{m.emoji}</span>
            {m.label}
          </button>
        ))}
      </div>

      {problem ? (
        <p className="mb-3 rounded-2xl px-3.5 py-2.5 text-[0.8125rem] leading-snug" style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPhoto(e.target.files?.[0])} />

      {step === "pick" ? (
        <label className="mb-2.5 flex items-center gap-2 rounded-2xl px-3.5" style={{ background: "var(--surface-2)" }}>
          <Icon name="search" size={17} style={{ color: "var(--muted)" }} />
          <input
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent py-3 text-[0.9375rem] outline-none"
            value={query}
            maxLength={80}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти продукт или блюдо"
            aria-label="Найти блюдо или продукт"
          />
          {query ? (
            <button onClick={() => setQuery("")} aria-label="Очистить" className="flex h-7 w-7 items-center justify-center rounded-full opacity-60 active:opacity-100">
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </label>
      ) : null}

      {step === "pick" && query.trim() ? (
        <FoodSearch
          query={query}
          entries={entries}
          pics={pics}
          onDish={(it) => {
            addItem(it, "repeat");
            setStep("review");
          }}
          onAddDish={(it) => addItem(it, "repeat")}
          onProduct={(p) => {
            setChosen(p);
            setStep("product");
          }}
          onAddProduct={(p) => addItem(itemFrom(p, portion(p)), "barcode")}
          onText={() => {
            setText(query.trim());
            void recognize({ text: query.trim() }, "text");
          }}
        />
      ) : null}

      {step === "pick" && !query.trim() ? (
        <div className="pb-3">
          {/* Способы добавить — одним рядом, чтобы список ниже было видно. */}
          <div className="grid grid-cols-4 gap-2">
            <Action emoji="📷" label="Фото" hot onClick={() => fileRef.current?.click()} />
            <Action emoji="🏷️" label="Штрихкод" onClick={() => setStep("barcode")} />
            <Action emoji="💬" label="Словами" onClick={() => setStep("text")} />
            <Action emoji="✏️" label="Вручную" onClick={() => setStep("manual")} />
          </div>

          <div className="mt-3.5 flex gap-1 rounded-2xl p-1" style={{ background: "var(--surface-2)" }} role="tablist">
            {LIST_TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className="flex-1 rounded-xl py-1.5 text-[0.8125rem] font-medium transition"
                style={tab === t.id ? { background: "var(--surface)", boxShadow: "0 1px 4px rgba(0,0,0,.08)" } : { color: "var(--muted)" }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-1 min-h-[40vh]">
            {tab !== "products" ? (
              dishes.length ? (
                <ul>
                  {dishes.map((d) => (
                    <DishRow
                      key={d.item.name}
                      d={d}
                      pic={pics.get(norm(d.item.name))}
                      onOpen={() => {
                        addItem(d.item, "repeat");
                        setStep("review");
                      }}
                      onAdd={() => addItem(d.item, "repeat")}
                    />
                  ))}
                </ul>
              ) : (
                <Empty text="Здесь появится то, что вы записываете. Начните с фото или найдите продукт" />
              )
            ) : products === null ? (
              <Empty text={offline ? "Без интернета список продуктов недоступен" : "Загружаю продукты…"} />
            ) : products.length ? (
              <>
                <ul>
                  {products.slice(0, shown).map((p) => (
                    <ProductRow
                      key={p.barcode}
                      p={p}
                      onOpen={() => {
                        setChosen(p);
                        setStep("product");
                      }}
                      onAdd={() => addItem(itemFrom(p, portion(p)), "barcode")}
                    />
                  ))}
                </ul>
                {products.length > shown ? (
                  <button onClick={() => setShown((n) => n + 40)} className="mt-1 w-full rounded-2xl py-2.5 text-[0.8125rem] font-medium" style={{ background: "var(--surface-2)" }}>
                    Показать ещё
                  </button>
                ) : null}
              </>
            ) : (
              <Empty text="В общей базе пока пусто. Отсканируйте штрихкод, и продукт появится здесь у всех" />
            )}
          </div>
        </div>
      ) : null}

      {step === "text" ? (
        <div className="pb-3">
          <textarea
            autoFocus
            rows={3}
            maxLength={500}
            className={`${inputClass} resize-none`}
            style={inputStyle}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Например: овсянка на молоке, банан и кофе с сахаром"
          />
          <p className="mb-3 mt-1.5 text-[0.75rem]" style={{ color: "var(--muted)" }}>
            Можно с весом: «рис 150 г, куриная грудка 120 г». Без веса посчитаю обычную порцию.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" className="!w-auto shrink-0 px-5" onClick={() => setStep("pick")}>
              Назад
            </Button>
            <Button onClick={() => void recognize({ text }, "text")} disabled={!text.trim()}>
              Посчитать
            </Button>
          </div>
        </div>
      ) : null}

      {step === "manual" ? (
        <ManualForm
          onBack={() => setStep(items.length ? "review" : "pick")}
          onAdd={(it) => {
            setItems((prev) => [...prev, it]);
            if (step === "manual" && !items.length) setSource("manual");
            setStep("review");
          }}
        />
      ) : null}

      {step === "barcode" ? (
        <BarcodeFlow
          onBack={() => setStep(items.length ? "review" : "pick")}
          onItem={(it) => {
            setItems((prev) => [...prev, it]);
            if (!items.length) setSource("barcode");
            setComment("");
            setStep("review");
          }}
        />
      ) : null}

      {step === "product" && chosen ? (
        <BarcodeFlow
          key={chosen.barcode}
          start={chosen}
          onBack={() => setStep(items.length ? "review" : "pick")}
          onItem={(it) => {
            setItems((prev) => [...prev, it]);
            if (!items.length) setSource("barcode");
            setComment("");
            setStep("review");
          }}
        />
      ) : null}

      {step === "busy" ? (
        <div className="flex flex-col items-center pb-6 pt-2 text-center">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="food-scan mb-4 h-44 w-44 rounded-3xl object-cover" />
          ) : (
            <span className="food-scan mb-4 flex h-20 w-20 items-center justify-center rounded-full text-4xl" style={{ background: "var(--surface-2)" }}>
              🥗
            </span>
          )}
          <p className="text-[0.9375rem] font-semibold">{photo ? "Смотрю, что на тарелке…" : "Считаю калории…"}</p>
          <p className="mt-1 text-[0.75rem]" style={{ color: "var(--muted)" }}>
            Обычно это занимает 5–15 секунд
          </p>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="pb-2">
          {dup && dupOk ? (
            <p className="mb-2.5 rounded-2xl px-3.5 py-2.5 text-[0.8125rem] leading-snug" style={{ background: "color-mix(in srgb, #f59e0b 16%, transparent)" }}>
              ⚠️ «{dup.name}» уже записано в этот приём пищи только что. Записать ещё раз? Если нет, просто закройте окно
            </p>
          ) : null}
          {comment ? (
            <p className="mb-2.5 rounded-2xl px-3.5 py-2 text-[0.75rem] leading-snug" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
              💡 {comment}
            </p>
          ) : null}
          <ul className="space-y-2">
            {items.map((it, i) => (
              <ItemRow
                key={i}
                item={it}
                onChange={(next) => setItems((prev) => prev.map((x, j) => (j === i ? next : x)))}
                onRemove={() => setItems((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
          </ul>
          {!items.length ? (
            <p className="py-3 text-center text-[0.8125rem]" style={{ color: "var(--muted)" }}>
              Список пуст
            </p>
          ) : null}
          <button
            onClick={() => {
              setQuery("");
              setStep("pick");
            }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl py-2.5 text-[0.8125rem] font-medium transition active:scale-[0.98]"
            style={{ border: "1.5px dashed var(--border)", color: "var(--muted)" }}
          >
            <Icon name="plus" size={14} /> Добавить ещё блюдо
          </button>
          <p className="mt-3 text-center text-[0.75rem] tabular-nums" style={{ color: "var(--muted)" }}>
            Б {fmt(sum.protein)} · Ж {fmt(sum.fat)} · У {fmt(sum.carbs)} г
          </p>
        </div>
      ) : null}
    </Sheet>
  );
}

function Action({ emoji, label, hot, onClick }: { emoji: string; label: string; hot?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 rounded-2xl py-2.5 text-[0.75rem] font-medium transition active:scale-95"
      style={
        hot
          ? { background: "linear-gradient(135deg, #fb923c, #f97316 45%, #ef4444)", color: "#fff", boxShadow: "0 8px 20px -10px rgba(249,115,22,.8)" }
          : { background: "var(--surface-2)" }
      }
    >
      <span className="text-[1.375rem] leading-none">{emoji}</span>
      {label}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="px-4 py-8 text-center text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
      {text}
    </p>
  );
}

/** Блюдо в списке перед сохранением: название и вес правятся, калории пересчитываются. */
function ItemRow({ item, onChange, onRemove }: { item: DraftItem; onChange: (it: DraftItem) => void; onRemove: () => void }) {
  const [grams, setGrams] = useState(item.grams ? String(item.grams) : "");
  useEffect(() => setGrams(item.grams ? String(item.grams) : ""), [item.grams]);
  return (
    <li className="rounded-2xl px-3 py-2.5" style={{ background: "var(--surface-2)" }}>
      <div className="flex items-center gap-2">
        <input
          className="min-w-0 flex-1 bg-transparent text-[0.9375rem] font-medium outline-none"
          value={item.name}
          maxLength={120}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
          aria-label="Название"
        />
        <button onClick={onRemove} aria-label={`Убрать «${item.name}»`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full opacity-50 active:opacity-100">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[0.8125rem]">
        <label className="flex items-center gap-1 rounded-xl px-2 py-1" style={{ background: "var(--surface)" }}>
          <input
            inputMode="decimal"
            className="w-12 bg-transparent text-right tabular-nums outline-none"
            value={grams}
            placeholder="—"
            onChange={(e) => setGrams(e.target.value)}
            onBlur={() => {
              const g = num(grams);
              // Сахар не зависит от объёма: пересчитываем напиток без него и добавляем обратно.
              if (g > 0 && g !== item.grams) onChange(withSugar(scaleItem(withSugar(item, 0), g), item.sugar ?? 0));
            }}
            aria-label={unitOf(item) === "ml" ? "Объём, мл" : "Вес, г"}
          />
        </label>
        {/* Нажать — сменить граммы на миллилитры и обратно. */}
        <button
          onClick={() => onChange({ ...item, unit: unitOf(item) === "ml" ? "g" : "ml" })}
          className="-ml-1 rounded-md px-1 underline decoration-dotted underline-offset-2"
          style={{ color: "var(--muted)" }}
          aria-label="Граммы или миллилитры"
        >
          {ul(unitOf(item))}
        </button>
        <span className="font-semibold tabular-nums" style={{ color: "var(--accent)" }}>
          {Math.round(item.kcal)} ккал
        </span>
        <span className="ml-auto tabular-nums text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          Б {fmt(item.protein)} · Ж {fmt(item.fat)} · У {fmt(item.carbs)}
        </span>
      </div>
      {canSweeten(item.name) ? (
        <div className="mt-2 flex items-center gap-2 text-[0.8125rem]">
          <span>🧊 Сахар</span>
          <span className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            {item.sugar ? `+${item.sugar * CUBE.kcal} ккал` : "кубик или ложка ≈ 5 г"}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => onChange(withSugar(item, Math.max(0, (item.sugar ?? 0) - 1)))}
              disabled={!item.sugar}
              aria-label="Меньше сахара"
              className="flex h-7 w-7 items-center justify-center rounded-full text-base leading-none disabled:opacity-40"
              style={{ background: "var(--surface)" }}
            >
              −
            </button>
            <span className="w-5 text-center font-semibold tabular-nums">{item.sugar ?? 0}</span>
            <button
              onClick={() => onChange(withSugar(item, Math.min(20, (item.sugar ?? 0) + 1)))}
              aria-label="Больше сахара"
              className="flex h-7 w-7 items-center justify-center rounded-full text-base leading-none"
              style={{ background: "var(--surface)", color: "var(--accent)" }}
            >
              +
            </button>
          </span>
        </div>
      ) : null}
    </li>
  );
}

function ManualForm({ onAdd, onBack }: { onAdd: (it: DraftItem) => void; onBack: () => void }) {
  const [name, setName] = useState("");
  const [grams, setGrams] = useState("");
  const [unitPick, setUnitPick] = useState<Unit | null>(null);
  const unit = unitPick ?? guessUnit(name);
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState("");
  const [f, setF] = useState("");
  const [c, setC] = useState("");
  const ok = name.trim() && num(kcal) > 0;
  const small = (label: string, value: string, set: (v: string) => void, extra?: React.ReactNode) => (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[0.75rem]" style={{ color: "var(--muted)" }}>
        {label}
        {extra}
      </span>
      <input inputMode="decimal" className={inputClass} style={inputStyle} value={value} onChange={(e) => set(e.target.value)} placeholder="0" />
    </label>
  );
  return (
    <div className="pb-3">
      <input autoFocus className={`${inputClass} mb-2`} style={inputStyle} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Название, например «Сырники»" />
      <div className="mb-2 grid grid-cols-2 gap-2">
        {small(unit === "ml" ? "Объём" : "Вес", grams, setGrams, <UnitToggle small value={unit} onChange={setUnitPick} />)}
        {small("Калории, ккал", kcal, setKcal)}
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {small("Белки, г", p, setP)}
        {small("Жиры, г", f, setF)}
        {small("Углеводы, г", c, setC)}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" className="!w-auto shrink-0 px-5" onClick={onBack}>
          Назад
        </Button>
        <Button
          disabled={!ok}
          onClick={() => onAdd({ name: name.trim(), grams: num(grams) || null, unit, kcal: num(kcal), protein: num(p), fat: num(f), carbs: num(c) })}
        >
          Добавить
        </Button>
      </div>
    </div>
  );
}
