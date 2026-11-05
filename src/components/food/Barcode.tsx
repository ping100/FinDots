"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { Button, inputClass, inputStyle } from "@/components/ui";
import type { DraftItem, Product } from "@/lib/food/types";
import { BASE_100, PerBasePicker, baseGrams, per100, type Base } from "./PerBase";
import { FoodPic } from "./FoodPic";
import { UnitToggle } from "./UnitToggle";
import { defaultPortion, guessUnit, ul, unitOf, type Unit } from "@/lib/food/units";

type Phase = "scan" | "look" | "found" | "unknown" | "form" | "reading";

/** Сканер на весь экран: камера, рамка, ручной ввод цифр. */
export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
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
        // Высокое разрешение: мелкий штрихкод на маленькой упаковке иначе не прочитать.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        const v = video.current;
        if (!alive || !v) return stream.getTracks().forEach((t) => t.stop());
        v.srcObject = stream;
        await v.play();
        // Непрерывный автофокус, где телефон его даёт.
        await stream
          .getVideoTracks()[0]
          ?.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] })
          .catch(() => undefined);

        // Встроенный распознаватель (Android, Chrome) быстрее; на iPhone его нет — тогда zxing.
        const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        let decode: (c: HTMLCanvasElement) => Promise<string | null>;
        if (Native) {
          const detector = new Native({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
          decode = async (c) => (await detector.detect(c).catch(() => []))[0]?.rawValue ?? null;
        } else {
          const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
          const hints = new Map<number, unknown>([
            [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128]],
            [DecodeHintType.TRY_HARDER, true],
          ]);
          const reader = new BrowserMultiFormatReader(hints as Map<never, unknown>);
          decode = async (c) => {
            try {
              return reader.decodeFromCanvas(c).getText();
            } catch {
              return null;
            }
          };
        }

        // Ищем в рамке (крупно), а через раз — по всему кадру: вдруг код не в рамке.
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        let n = 0;
        let timer = 0;
        const tick = async () => {
          if (!alive || done.current || !v.videoWidth) {
            if (alive && !done.current) timer = window.setTimeout(tick, 150);
            return;
          }
          const vw = v.videoWidth;
          const vh = v.videoHeight;
          let sx = 0, sy = 0, sw = vw, sh = vh;
          const box = frame.current?.getBoundingClientRect();
          const el = v.getBoundingClientRect();
          if (box && n % 3 !== 2) {
            // Видео растянуто как object-cover: пересчитываем рамку в пиксели кадра.
            const k = Math.max(el.width / vw, el.height / vh);
            const ox = (el.width - vw * k) / 2;
            const oy = (el.height - vh * k) / 2;
            const pad = 0.15;
            sx = Math.max(0, (box.left - el.left - ox) / k - (box.width / k) * pad);
            sy = Math.max(0, (box.top - el.top - oy) / k - (box.height / k) * pad);
            sw = Math.min(vw - sx, (box.width / k) * (1 + 2 * pad));
            sh = Math.min(vh - sy, (box.height / k) * (1 + 2 * pad));
          }
          n++;
          const scale = Math.min(1, 1280 / sw);
          canvas.width = Math.round(sw * scale);
          canvas.height = Math.round(sh * scale);
          ctx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          const code = await decode(canvas);
          if (code) hit(code);
          else timer = window.setTimeout(tick, 120);
        };
        void tick();
        stop = () => {
          clearTimeout(timer);
          stream.getTracks().forEach((t) => t.stop());
        };
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
        <div ref={frame} className="relative h-40 w-72 rounded-3xl" style={{ boxShadow: "0 0 0 100vmax rgba(0,0,0,.55)", border: "2px solid rgba(255,255,255,.85)" }}>
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
  return { name: p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.name}, ${p.brand}` : p.name, grams, unit: unitOf(p), kcal: Math.round(p.kcal * k), protein: r(p.protein), fat: r(p.fat), carbs: r(p.carbs) };
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
export function BarcodeFlow({ onItem, onBack, start }: { onItem: (item: DraftItem) => void; onBack: () => void; start?: Product }) {
  // start — продукт уже выбран (из поиска): сразу к граммам, без сканера.
  const [phase, setPhase] = useState<Phase>(start ? "found" : "scan");
  const [code, setCode] = useState(start?.barcode ?? "");
  const [product, setProduct] = useState<Product | null>(start ?? null);
  const [grams, setGrams] = useState(String(start ? defaultPortion(start) : 100));
  const [problem, setProblem] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", brand: "", kcal: "", protein: "", fat: "", carbs: "", pack: "" });
  // Граммы или мл: пока человек не выбрал сам, угадываем по названию.
  const [unitPick, setUnitPick] = useState<Unit | null>(null);
  const formUnit = unitPick ?? guessUnit(form.name);
  // На сколько грамм вписаны цифры (с этикетки нейросеть уже пересчитала на 100 г).
  const [base, setBase] = useState<Base>(BASE_100);
  const g = baseGrams(base, form.pack);
  const [fromLabel, setFromLabel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existed, setExisted] = useState(false);
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
        setGrams(String(defaultPortion(data.product)));
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
      if (data?.product?.unit) setUnitPick(data.product.unit);
      if (!res.ok || !data?.product) throw new Error(data?.error ?? "Не получилось прочитать этикетку");
      const p = data.product;
      setForm({ name: p.name, brand: p.brand ?? "", kcal: String(p.kcal), protein: String(p.protein), fat: String(p.fat), carbs: String(p.carbs), pack: p.pack_grams ? String(p.pack_grams) : "" });
      setFromLabel(true);
      setBase(BASE_100);
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
      kcal: per100(num(form.kcal), g),
      protein: per100(num(form.protein), g),
      fat: per100(num(form.fat), g),
      carbs: per100(num(form.carbs), g),
      pack_grams: num(form.pack) || null,
      unit: formUnit,
      source: fromLabel ? "label" : "user",
    };
    setSaving(true);
    setProblem(null);
    try {
      const res = await fetch("/api/food-barcode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      const data = (await res.json().catch(() => null)) as { error?: string; existed?: boolean; product?: Product | null } | null;
      if (!res.ok) throw new Error(data?.error ?? "Не получилось сохранить продукт");
      // Пока вводили, продукт успел добавить кто-то другой — показываем его данные.
      const saved = data?.existed && data.product ? data.product : p;
      setExisted(!!data?.existed);
      setProduct(saved);
      setGrams(String(defaultPortion(saved)));
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
    const chips = (unitOf(product) === "ml" ? [100, 200, 250, 330, 500] : [50, 100, 150, 200]).filter((x) => x !== product.pack_grams);
    const u = ul(unitOf(product));
    return (
      <div className="pb-3">
        <div className="food-card mb-3 flex gap-3 rounded-3xl p-3.5">
          <FoodPic src={product.image_url} name={product.name} size={64} />
          <div className="min-w-0 flex-1">
          {product.status === "verified" ? (
            <span className="mb-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold" style={{ background: "color-mix(in srgb, #22c55e 16%, transparent)", color: "#16a34a" }}>
              <Icon name="check" size={12} /> Проверено Dots
            </span>
          ) : null}
          <p className="text-[1rem] font-semibold leading-snug">{product.name}</p>
          {product.brand ? (
            <p className="text-[0.75rem]" style={{ color: "var(--muted)" }}>
              {product.brand}
            </p>
          ) : null}
          {existed ? (
            <p className="mt-1.5 text-[0.75rem] leading-snug" style={{ color: "var(--accent)" }}>
              Этот продукт уже добавил кто-то другой, вот его данные. Если они не сходятся с упаковкой, поправьте блюдо на следующем шаге
            </p>
          ) : null}
          <p className="mt-1.5 text-[0.75rem] tabular-nums" style={{ color: "var(--muted)" }}>
            На 100 {u}: {fmt(product.kcal)} ккал · Б {fmt(product.protein)} · Ж {fmt(product.fat)} · У {fmt(product.carbs)}
          </p>
          </div>
        </div>
        <p className="mb-1.5 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
          {unitOf(product) === "ml" ? "Сколько выпили" : "Сколько съели"}
        </p>
        <div className="mb-2 flex items-center gap-2">
          <input inputMode="decimal" className={`${inputClass} w-28 text-center text-[1.125rem] font-semibold tabular-nums`} style={inputStyle} value={grams} onChange={(e) => setGrams(e.target.value)} aria-label={unitOf(product) === "ml" ? "Миллилитры" : "Граммы"} />
          <span style={{ color: "var(--muted)" }}>{u}</span>
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
              Вся упаковка · {product.pack_grams} {u}
            </button>
          ) : null}
          {chips.map((x) => (
            <button key={x} onClick={() => setGrams(String(x))} className="rounded-full px-3 py-1.5 text-[0.8125rem]" style={{ background: "var(--surface-2)" }}>
              {x} {u}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="!w-auto shrink-0 px-5" onClick={() => (start ? onBack() : setPhase("scan"))}>
            {start ? "Назад" : "Другой"}
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
              setUnitPick(null);
              setBase(BASE_100);
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
        {fromLabel ? "Проверьте, всё ли прочиталось верно. Нейросеть уже пересчитала на 100 г" : "Перепишите цифры с упаковки как есть"}
      </p>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[0.75rem]" style={{ color: "var(--muted)" }}>
          Это жидкость? Тогда в миллилитрах
        </span>
        <UnitToggle value={formUnit} onChange={setUnitPick} />
      </div>
      <PerBasePicker base={base} onChange={setBase} pack={form.pack} unit={formUnit} />
      <div className="mb-3 grid grid-cols-2 gap-2">
        {field("name", "Название", true)}
        {field("brand", "Марка")}
        {field("pack", formUnit === "ml" ? "Объём упаковки, мл" : "Вес упаковки, г")}
        {field("kcal", "Калории, ккал")}
        {field("protein", "Белки, г")}
        {field("fat", "Жиры, г")}
        {field("carbs", "Углеводы, г")}
      </div>
      {g && g !== 100 && num(form.kcal) > 0 ? (
        <p className="-mt-1 mb-3 rounded-2xl px-3 py-2 text-[0.75rem] tabular-nums" style={{ background: "var(--surface-2)" }}>
          На 100 {ul(formUnit)} получится: <b>{per100(num(form.kcal), g)} ккал</b> · Б {fmt(per100(num(form.protein), g))} · Ж {fmt(per100(num(form.fat), g))} · У {fmt(per100(num(form.carbs), g))}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button variant="ghost" className="!w-auto shrink-0 px-5" onClick={() => setPhase("unknown")}>
          Назад
        </Button>
        <Button disabled={!form.name.trim() || !(num(form.kcal) > 0) || !g || per100(num(form.kcal), g) > 950 || saving} onClick={() => void saveProduct()}>
          {saving ? "Сохраняю…" : "Сохранить продукт"}
        </Button>
      </div>
    </div>
  );
}
