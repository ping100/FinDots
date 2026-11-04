"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { Button, inputClass, inputStyle } from "@/components/ui";
import type { DraftItem, Product } from "@/lib/food/types";

type Phase = "scan" | "look" | "found" | "unknown" | "form" | "reading";

/** Сканер на весь экран: камера, рамка, ручной ввод цифр. */
function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const done = useRef(false);
  // Через ref: камера не должна перезапускаться, если родитель перерисовался.
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stop: (() => void) | null = null;
    let alive = true;
    const hit = (code: string) => {
      if (done.current || !/^[0-9]{6,14}$/.test(code)) return;
      done.current = true;
      navigator.vibrate?.(40);
      stop?.();
      onCodeRef.current(code);
    };
    void (async () => {
      try {
        // Встроенный распознаватель (Android, Chrome) быстрее; на iPhone его нет — тогда zxing.
        const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        if (Native) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          if (!alive || !video.current) return stream.getTracks().forEach((t) => t.stop());
          video.current.srcObject = stream;
          await video.current.play();
          const detector = new Native({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
          let raf = 0;
          const tick = async () => {
            if (!alive || done.current || !video.current) return;
            const found = await detector.detect(video.current).catch(() => []);
            if (found[0]) hit(found[0].rawValue);
            else raf = window.setTimeout(tick, 150);
          };
          void tick();
          stop = () => {
            clearTimeout(raf);
            stream.getTracks().forEach((t) => t.stop());
          };
          return;
        }
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128]]]);
        const reader = new BrowserMultiFormatReader(hints);
        if (!alive || !video.current) return;
        const controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video.current, (result) => {
          if (result) hit(result.getText());
        });
        stop = () => controls.stop();
        if (!alive) stop();
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        setProblem(
          name === "NotAllowedError"
            ? "Нет доступа к камере. Разрешите его в настройках телефона или введите цифры под штрихкодом"
            : "Камера не запустилась. Введите цифры под штрихкодом",
        );
      }
    })();
    return () => {
      alive = false;
      stop?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}>
        <span className="text-[0.875rem] font-semibold">Наведите на штрихкод</span>
        <button onClick={onClose} aria-label="Закрыть" className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,.14)" }}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        {/* Рамка: тёмное вокруг, светлое окно и бегущая линия. */}
        <div className="relative h-40 w-72 rounded-3xl" style={{ boxShadow: "0 0 0 100vmax rgba(0,0,0,.55)", border: "2px solid rgba(255,255,255,.85)" }}>
          <span className="barcode-line absolute inset-x-4 h-0.5 rounded-full" style={{ background: "#fb923c", boxShadow: "0 0 12px #fb923c" }} />
        </div>
        {problem ? (
          <p className="absolute inset-x-6 bottom-6 rounded-2xl px-4 py-3 text-center text-[0.8125rem] leading-snug" style={{ background: "rgba(0,0,0,.7)" }}>
            {problem}
          </p>
        ) : null}
      </div>
      <div className="flex gap-2 px-4 pt-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 14px)" }}>
        <input
          inputMode="numeric"
          className="min-w-0 flex-1 rounded-2xl px-4 py-3 text-[0.9375rem] tabular-nums text-white outline-none"
          style={{ background: "rgba(255,255,255,.12)" }}
          placeholder="Или цифры под штрихкодом"
          value={typed}
          onChange={(e) => setTyped(e.target.value.replace(/\D/g, "").slice(0, 14))}
        />
        <button
          disabled={typed.length < 8}
          onClick={() => onCode(typed)}
          className="shrink-0 rounded-2xl px-4 font-semibold disabled:opacity-40"
          style={{ background: "#f97316" }}
        >
          Найти
        </button>
      </div>
    </div>
  );
}

const num = (s: string) => {
  const n = Number(s.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

/** Блюдо из продукта на N грамм. */
export function itemFrom(p: Product, grams: number): DraftItem {
  const k = grams / 100;
  const r = (x: number) => Math.round(x * k * 10) / 10;
  return { name: p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.name}, ${p.brand}` : p.name, grams, kcal: Math.round(p.kcal * k), protein: r(p.protein), fat: r(p.fat), carbs: r(p.carbs) };
}

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error("Не получилось открыть фото"));
      i.src = url;
    });
    // Этикетке нужно больше деталей, чем тарелке: мелкие цифры.
    const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Штрихкод: сканируем → ищем в общей базе Dots и Open Food Facts → вводим,
 * сколько грамм съели. Нет продукта — снять этикетку (прочитает нейросеть)
 * или ввести вручную; продукт сохраняется в общую базу для всех.
 */
export function BarcodeFlow({ onItem, onBack }: { onItem: (item: DraftItem) => void; onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>("scan");
  const [code, setCode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [grams, setGrams] = useState("100");
  const [problem, setProblem] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", brand: "", kcal: "", protein: "", fat: "", carbs: "", pack: "" });
  const [fromLabel, setFromLabel] = useState(false);
  const [saving, setSaving] = useState(false);
  const file = useRef<HTMLInputElement | null>(null);

  const look = async (c: string) => {
    setCode(c);
    setProblem(null);
    setPhase("look");
    try {
      const res = await fetch(`/api/food-barcode?code=${c}`);
      const data = (await res.json().catch(() => null)) as { product?: Product; notFound?: boolean; error?: string } | null;
      if (data?.product) {
        setProduct(data.product);
        setGrams(String(data.product.pack_grams && data.product.pack_grams <= 300 ? data.product.pack_grams : 100));
        setPhase("found");
      } else if (data?.notFound) setPhase("unknown");
      else throw new Error(data?.error ?? "Не получилось найти, попробуйте ещё раз");
    } catch (e) {
      setProblem(navigator.onLine ? (e instanceof Error ? e.message : String(e)) : "Без интернета продукт не найти");
      setPhase("unknown");
    }
  };

  const readLabel = async (f: File | undefined) => {
    if (!f) return;
    setProblem(null);
    setPhase("reading");
    try {
      const image = await shrink(f);
      const res = await fetch("/api/food-analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, label: true }) });
      const data = (await res.json().catch(() => null)) as { product?: Omit<Product, "barcode" | "source">; error?: string } | null;
      if (!res.ok || !data?.product) throw new Error(data?.error ?? "Не получилось прочитать этикетку");
      const p = data.product;
      setForm({ name: p.name, brand: p.brand ?? "", kcal: String(p.kcal), protein: String(p.protein), fat: String(p.fat), carbs: String(p.carbs), pack: p.pack_grams ? String(p.pack_grams) : "" });
      setFromLabel(true);
      setPhase("form");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
      setPhase("unknown");
    }
  };

  const saveProduct = async () => {
    if (saving) return;
    const p: Product = {
      barcode: code,
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      kcal: num(form.kcal),
      protein: num(form.protein),
      fat: num(form.fat),
      carbs: num(form.carbs),
      pack_grams: num(form.pack) || null,
      source: fromLabel ? "label" : "user",
    };
    setSaving(true);
    setProblem(null);
    try {
      const res = await fetch("/api/food-barcode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Не получилось сохранить продукт");
      setProduct(p);
      setGrams(String(p.pack_grams && p.pack_grams <= 300 ? p.pack_grams : 100));
      setPhase("found");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const Problem = problem ? (
    <p className="mb-3 rounded-2xl px-3.5 py-2.5 text-[0.8125rem] leading-snug" style={{ background: "color-mix(in srgb, var(--danger) 12%, transparent)", color: "var(--danger)" }}>
      {problem}
    </p>
  ) : null;

  if (phase === "scan") return <Scanner onCode={(c) => void look(c)} onClose={onBack} />;

  if (phase === "look" || phase === "reading")
    return (
      <div className="flex flex-col items-center pb-6 pt-2 text-center">
        <span className="food-scan mb-4 flex h-20 w-20 items-center justify-center rounded-full text-4xl" style={{ background: "var(--surface-2)" }}>
          {phase === "look" ? "🔎" : "🏷️"}
        </span>
        <p className="text-[0.9375rem] font-semibold">{phase === "look" ? "Ищу продукт…" : "Читаю этикетку…"}</p>
        <p className="mt-1 text-[0.75rem] tabular-nums" style={{ color: "var(--muted)" }}>
          {phase === "look" ? code : "Обычно это занимает 5–15 секунд"}
        </p>
      </div>
    );

  if (phase === "found" && product) {
    const g = num(grams);
    const it = itemFrom(product, g || 0);
    const chips = [50, 100, 150, 200].filter((x) => x !== product.pack_grams);
    return (
      <div className="pb-3">
        <div className="food-card mb-3 rounded-3xl p-3.5">
          <p className="text-[1rem] font-semibold leading-snug">{product.name}</p>
          {product.brand ? (
            <p className="text-[0.75rem]" style={{ color: "var(--muted)" }}>
              {product.brand}
            </p>
          ) : null}
          <p className="mt-1.5 text-[0.75rem] tabular-nums" style={{ color: "var(--muted)" }}>
            На 100 г: {product.kcal} ккал · Б {fmt(product.protein)} · Ж {fmt(product.fat)} · У {fmt(product.carbs)}
          </p>
        </div>
        <p className="mb-1.5 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
          Сколько съели
        </p>
        <div className="mb-2 flex items-center gap-2">
          <input inputMode="decimal" className={`${inputClass} w-28 text-center text-[1.125rem] font-semibold tabular-nums`} style={inputStyle} value={grams} onChange={(e) => setGrams(e.target.value)} aria-label="Граммы" />
          <span style={{ color: "var(--muted)" }}>г</span>
          <span className="ml-auto text-right">
            <span className="block text-[1.5rem] font-bold leading-none tabular-nums" style={{ color: "var(--accent)" }}>
              {it.kcal}
            </span>
            <span className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              ккал
            </span>
          </span>
        </div>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {product.pack_grams ? (
            <button onClick={() => setGrams(String(product.pack_grams))} className="rounded-full px-3 py-1.5 text-[0.8125rem] font-medium" style={{ background: "var(--surface-2)", color: "var(--accent)" }}>
              Вся упаковка · {product.pack_grams} г
            </button>
          ) : null}
          {chips.map((x) => (
            <button key={x} onClick={() => setGrams(String(x))} className="rounded-full px-3 py-1.5 text-[0.8125rem]" style={{ background: "var(--surface-2)" }}>
              {x} г
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="!w-auto shrink-0 px-5" onClick={() => setPhase("scan")}>
            Другой
          </Button>
          <Button disabled={!(g > 0)} onClick={() => onItem(it)}>
            Добавить
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "unknown")
    return (
      <div className="pb-3">
        {Problem}
        <p className="mb-1 text-[0.9375rem] font-semibold">Такого продукта пока нет в базе</p>
        <p className="mb-3 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Штрихкод {code}. Добавьте его один раз, и в следующий раз он найдётся сразу у всех в Dots.
        </p>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => void readLabel(e.target.files?.[0])} />
        <div className="space-y-2.5">
          <button
            onClick={() => file.current?.click()}
            className="flex w-full items-center gap-3.5 rounded-3xl p-4 text-left text-white transition active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #fb923c, #f97316 45%, #ef4444)" }}
          >
            <span className="text-2xl">🏷️</span>
            <span>
              <span className="block text-[0.9375rem] font-semibold">Сфотографировать этикетку</span>
              <span className="block text-[0.75rem] opacity-90">Табличку «Пищевая ценность», нейросеть прочитает цифры</span>
            </span>
          </button>
          <Button
            variant="ghost"
            onClick={() => {
              setFromLabel(false);
              setPhase("form");
            }}
          >
            Ввести вручную
          </Button>
          <button onClick={() => setPhase("scan")} className="w-full py-2 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            Сканировать ещё раз
          </button>
        </div>
      </div>
    );

  // Форма продукта: с этикетки (уже заполнена) или вручную.
  const field = (key: keyof typeof form, label: string, wide = false) => (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="mb-1 block text-[0.75rem]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <input
        inputMode={key === "name" || key === "brand" ? "text" : "decimal"}
        className={inputClass}
        style={inputStyle}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </label>
  );
  return (
    <div className="pb-3">
      {Problem}
      <p className="mb-2 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
        {fromLabel ? "Проверьте, всё ли прочиталось верно. Значения на 100 г" : "Перепишите с упаковки. Значения на 100 г"}
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {field("name", "Название", true)}
        {field("brand", "Марка")}
        {field("pack", "Вес упаковки, г")}
        {field("kcal", "Калории, ккал")}
        {field("protein", "Белки, г")}
        {field("fat", "Жиры, г")}
        {field("carbs", "Углеводы, г")}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" className="!w-auto shrink-0 px-5" onClick={() => setPhase("unknown")}>
          Назад
        </Button>
        <Button disabled={!form.name.trim() || !(num(form.kcal) > 0) || saving} onClick={() => void saveProduct()}>
          {saving ? "Сохраняю…" : "Сохранить продукт"}
        </Button>
      </div>
    </div>
  );
}
