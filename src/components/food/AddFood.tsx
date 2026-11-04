"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { Button, Sheet, inputClass, inputStyle } from "@/components/ui";
import { scaleItem, totals } from "@/lib/food/norms";
import { MEALS, type DraftItem, type Meal, type Source } from "@/lib/food/types";
import { useFood } from "./DataProvider";
import { BarcodeFlow } from "./Barcode";

type Step = "pick" | "text" | "manual" | "busy" | "review" | "barcode";

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
  }, [open, startMeal]);

  // Недавнее: последние разные блюда, свежие первыми.
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: DraftItem[] = [];
    for (let i = entries.length - 1; i >= 0 && out.length < 10; i--) {
      const e = entries[i];
      const key = e.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: e.name, grams: e.grams, kcal: Number(e.kcal), protein: Number(e.protein), fat: Number(e.fat), carbs: Number(e.carbs) });
    }
    return out;
  }, [entries]);

  const recognize = async (payload: { image?: string; text?: string }, src: Source) => {
    setProblem(null);
    setStep("busy");
    try {
      const res = await fetch("/api/food-analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => null)) as { items?: DraftItem[]; comment?: string; error?: string } | null;
      if (!res.ok || !data?.items) throw new Error(data?.error ?? "Не получилось распознать, попробуйте ещё раз");
      if (!data.items.length) throw new Error(data.comment || "Не нашёл на фото еды. Попробуйте другое фото или опишите словами");
      setItems(data.items);
      setComment(data.comment ?? "");
      setSource(src);
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

  const save = async () => {
    const list = items.filter((x) => x.name.trim());
    if (!list.length || saving) return;
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
  const title = step === "review" ? "Проверьте, что получилось" : step === "text" ? "Опишите словами" : step === "manual" ? "Вручную" : step === "barcode" ? "Штрихкод" : "Что вы съели?";

  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      footer={
        step === "review" ? (
          <div className="flex gap-2 pb-2">
            <Button variant="ghost" className="!w-auto shrink-0 px-5" onClick={() => setStep("pick")}>
              Назад
            </Button>
            <Button onClick={() => void save()} disabled={saving || !items.length}>
              {saving ? "Сохраняю…" : `Сохранить · ${Math.round(sum.kcal)} ккал`}
            </Button>
          </div>
        ) : null
      }
    >
      {/* Приём пищи — всегда виден: сразу понятно, куда запишется. */}
      <div className="mb-3 grid grid-cols-4 gap-1.5">
        {MEALS.map((m) => (
          <button
            key={m.id}
            onClick={() => setMeal(m.id)}
            aria-pressed={meal === m.id}
            className="flex flex-col items-center rounded-2xl py-1.5 text-[0.75rem] font-medium transition active:scale-95"
            style={meal === m.id ? { background: "var(--accent)", color: "#fff" } : { background: "var(--surface-2)" }}
          >
            <span className="text-base">{m.emoji}</span>
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
        <div className="space-y-2.5 pb-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-3.5 rounded-3xl p-4 text-left text-white transition active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #fb923c, #f97316 45%, #ef4444)", boxShadow: "0 12px 28px -12px rgba(249,115,22,.7)" }}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "rgba(255,255,255,.22)" }}>
              <Icon name="camera" size={24} />
            </span>
            <span>
              <span className="block text-[1rem] font-semibold">Сфотографировать еду</span>
              <span className="block text-[0.75rem] opacity-90">Нейросеть посчитает калории и БЖУ</span>
            </span>
          </button>
          <div className="grid grid-cols-3 gap-2">
            <Tile emoji="🏷️" title="Штрихкод" hint="КБЖУ с упаковки" onClick={() => setStep("barcode")} />
            <Tile emoji="💬" title="Словами" hint="«гречка и котлета»" onClick={() => setStep("text")} />
            <Tile emoji="✏️" title="Вручную" hint="своё блюдо" onClick={() => setStep("manual")} />
          </div>
          {recent.length ? (
            <div className="pt-2">
              <p className="mb-1.5 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
                Недавнее
              </p>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((r) => (
                  <button
                    key={r.name}
                    onClick={() => {
                      setItems([r]);
                      setSource("repeat");
                      setComment("");
                      setStep("review");
                    }}
                    className="rounded-full px-3 py-1.5 text-[0.8125rem] transition active:scale-95"
                    style={{ background: "var(--surface-2)" }}
                  >
                    {r.name} <span style={{ color: "var(--muted)" }}>· {Math.round(r.kcal)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
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
            onClick={() => setStep("manual")}
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

function Tile({ emoji, title, hint, onClick }: { emoji: string; title: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="food-card rounded-3xl p-3 text-left transition active:scale-[0.98]">
      <span className="text-2xl">{emoji}</span>
      <span className="mt-1 block text-[0.9375rem] font-semibold">{title}</span>
      <span className="block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
        {hint}
      </span>
    </button>
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
              if (g > 0 && g !== item.grams) onChange(scaleItem(item, g));
            }}
            aria-label="Вес, г"
          />
          <span style={{ color: "var(--muted)" }}>г</span>
        </label>
        <span className="font-semibold tabular-nums" style={{ color: "var(--accent)" }}>
          {Math.round(item.kcal)} ккал
        </span>
        <span className="ml-auto tabular-nums text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          Б {fmt(item.protein)} · Ж {fmt(item.fat)} · У {fmt(item.carbs)}
        </span>
      </div>
    </li>
  );
}

function ManualForm({ onAdd, onBack }: { onAdd: (it: DraftItem) => void; onBack: () => void }) {
  const [name, setName] = useState("");
  const [grams, setGrams] = useState("");
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState("");
  const [f, setF] = useState("");
  const [c, setC] = useState("");
  const ok = name.trim() && num(kcal) > 0;
  const small = (label: string, value: string, set: (v: string) => void) => (
    <label className="block">
      <span className="mb-1 block text-[0.75rem]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <input inputMode="decimal" className={inputClass} style={inputStyle} value={value} onChange={(e) => set(e.target.value)} placeholder="0" />
    </label>
  );
  return (
    <div className="pb-3">
      <input autoFocus className={`${inputClass} mb-2`} style={inputStyle} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Название, например «Сырники»" />
      <div className="mb-2 grid grid-cols-2 gap-2">
        {small("Вес, г", grams, setGrams)}
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
          onClick={() => onAdd({ name: name.trim(), grams: num(grams) || null, kcal: num(kcal), protein: num(p), fat: num(f), carbs: num(c) })}
        >
          Добавить
        </Button>
      </div>
    </div>
  );
}
