"use client";

import { useEffect, useState } from "react";
import { FEM_GRADIENT } from "@/lib/fem/cycle";

/**
 * Одноразовые фото в «Вместе»: подготовка перед отправкой, заглушка в
 * ленте (размытые цвета самого фото и цветок поверх) и просмотр на весь
 * экран. Само фото до открытия по заглушке не угадать: от него остаются
 * только 4 цвета.
 */

const MAX_SIDE = 1600;

/** Сжать до 1600 px по длинной стороне и взять 4 основных цвета. */
export async function preparePhoto(file: File): Promise<{ blob: Blob; colors: string[]; url: string }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("Не получилось открыть фото. Попробуйте другое");
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * k);
  const h = Math.round(bitmap.height * k);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не получилось подготовить фото");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.82));
  if (!blob) throw new Error("Не получилось подготовить фото");

  // Цвета — с картинки 2×2: левый верх, правый верх, левый низ, правый низ.
  const tiny = document.createElement("canvas");
  tiny.width = 2;
  tiny.height = 2;
  const t = tiny.getContext("2d");
  let colors: string[] = [];
  if (t) {
    t.drawImage(bitmap, 0, 0, 2, 2);
    const px = t.getImageData(0, 0, 2, 2).data;
    for (let i = 0; i < 4; i++) {
      const hex = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");
      colors.push(`#${hex}`);
    }
  }
  if (colors.length !== 4) colors = ["#f9a8d4", "#c4b5fd", "#fda4af", "#a5f3fc"];
  bitmap.close();
  return { blob, colors, url: URL.createObjectURL(blob) };
}

/** Лепестки цветка поверх заглушки — как цветок на главной, только белый. */
function Bloom({ dim }: { dim?: boolean }) {
  const petals = 12;
  return (
    <svg viewBox="-50 -50 100 100" className="absolute left-1/2 top-[44%] h-28 w-28 -translate-x-1/2 -translate-y-1/2" aria-hidden>
      <g className={dim ? "" : "fem-photo-bloom"} style={{ transformOrigin: "0 0" }}>
        {Array.from({ length: petals }, (_, i) => (
          <path
            key={i}
            d="M0 -10 C 9 -18 8 -36 0 -44 C -8 -36 -9 -18 0 -10 Z"
            transform={`rotate(${(i / petals) * 360})`}
            fill="#fff"
            fillOpacity={dim ? 0.35 : 0.55}
            stroke="#fff"
            strokeOpacity={0.8}
            strokeWidth={0.8}
          />
        ))}
      </g>
      <circle r={11} fill="#fff" fillOpacity={dim ? 0.5 : 0.85} />
      <text y={4.5} textAnchor="middle" fontSize={12}>
        {dim ? "✓" : "📷"}
      </text>
    </svg>
  );
}

export type PhotoState = "ready" | "waiting" | "opened" | "expired" | "seen";

/** Заглушка фото в ленте. */
export function PhotoBubble({
  colors,
  state,
  mine,
  busy,
  onOpen,
}: {
  colors: string[];
  state: PhotoState;
  mine: boolean;
  busy?: boolean;
  onOpen?: () => void;
}) {
  const c = colors.length === 4 ? colors : ["#f9a8d4", "#c4b5fd", "#fda4af", "#a5f3fc"];
  const gone = state === "opened" || state === "expired" || state === "seen";
  const label =
    state === "ready"
      ? busy
        ? "Открываю…"
        : "Нажмите, чтобы открыть"
      : state === "waiting"
        ? "Ещё не открыли"
        : state === "seen"
          ? "Просмотрено"
          : state === "opened"
            ? "Вы посмотрели"
            : "Не открыли за сутки";
  return (
    <button
      onClick={state === "ready" && !busy ? onOpen : undefined}
      disabled={state !== "ready" || busy}
      className="relative block h-56 w-44 overflow-hidden text-left transition active:scale-[0.98] disabled:active:scale-100"
      style={{
        borderRadius: mine ? "1.5rem 1.5rem 0.4rem 1.5rem" : "1.5rem 1.5rem 1.5rem 0.4rem",
        boxShadow: "0 10px 28px -14px rgba(0,0,0,.45)",
        cursor: state === "ready" ? "pointer" : "default",
      }}
      aria-label={`Одноразовое фото. ${label}`}
    >
      {/* Цвета фото — мягкими пятнами, как будто сквозь матовое стекло. */}
      <span
        className="absolute inset-[-20%]"
        style={{
          background: `radial-gradient(circle at 22% 20%, ${c[0]} 0%, transparent 58%),
            radial-gradient(circle at 80% 22%, ${c[1]} 0%, transparent 58%),
            radial-gradient(circle at 20% 82%, ${c[2]} 0%, transparent 58%),
            radial-gradient(circle at 82% 80%, ${c[3]} 0%, transparent 58%),
            linear-gradient(135deg, ${c[0]}, ${c[3]})`,
          filter: `blur(18px) saturate(${gone ? 0.25 : 1.25})`,
          opacity: gone ? 0.6 : 1,
        }}
      />
      {/* Розовая дымка в цвет приложения. */}
      <span className="absolute inset-0" style={{ background: FEM_GRADIENT, opacity: gone ? 0.12 : 0.22, mixBlendMode: "soft-light" }} />
      <Bloom dim={gone} />
      <span className="absolute inset-x-2 bottom-2 rounded-2xl px-2.5 py-1.5 text-center text-[0.6875rem] font-semibold leading-tight text-white"
        style={{ background: "rgba(0,0,0,.28)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      >
        <span className="block text-[0.625rem] font-medium opacity-85">Откроется один раз</span>
        {label}
      </span>
    </button>
  );
}

/**
 * Фото на весь экран. Закрыли — исчезло совсем (с сервера оно уже удалено).
 *
 * Запретить снимок экрана сайт не может (ни iPhone, ни Android такого не
 * дают), поэтому только затрудняем: фото прячется, когда приложение уходит
 * в фон (переключатель приложений, шторка, запись экрана) и по клавишам
 * снимка на компьютере; не печатается; поверх — едва заметная подпись с
 * именем получателя и временем.
 */
export function PhotoViewer({ url, mark, onClose }: { url: string; mark: string; onClose: () => void }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => {
      clearTimeout(timer);
      setHidden(true);
    };
    // Вернулись — показываем не сразу: снимок «на выходе» успеет попасть на пустой экран.
    const show = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible" && document.hasFocus()) timer = setTimeout(() => setHidden(false), 400);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Print Screen, ⌘⇧3/4/5 и Win+Shift+S — прячем, пока клавиши зажаты.
      if (e.key === "PrintScreen" || (e.shiftKey && (e.metaKey || e.ctrlKey))) {
        hide();
        timer = setTimeout(show, 1500);
      }
    };
    const vis = () => (document.visibilityState === "visible" ? show() : hide());
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", hide);
    window.addEventListener("focus", show);
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", show);
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [onClose]);
  return (
    <div
      className="fem-photo-viewer fixed inset-0 z-[90] flex flex-col bg-black"
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitUserSelect: "none", userSelect: "none" }}
    >
      <div className="flex items-center justify-between px-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}>
        <span className="text-[0.75rem] text-white/70">Фото исчезнет, когда закроете</span>
        <button
          onClick={onClose}
          aria-label="Закрыть"
          className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-white transition active:scale-90"
          style={{ background: "rgba(255,255,255,.14)" }}
        >
          ✕
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-3">
        <div className="relative max-h-full max-w-full" style={{ visibility: hidden ? "hidden" : "visible" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Фото"
            draggable={false}
            className="block max-h-[calc(100dvh-7rem)] max-w-full rounded-2xl object-contain"
            style={{ WebkitTouchCallout: "none", pointerEvents: "none" } as React.CSSProperties}
          />
          {/* Подпись получателя — едва заметно, по диагонали. */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
            <div className="absolute inset-[-50%] flex flex-col justify-around" style={{ transform: "rotate(-24deg)" }}>
              {Array.from({ length: 9 }, (_, i) => (
                <p
                  key={i}
                  className="whitespace-nowrap text-center text-[0.8125rem] font-semibold tracking-wide"
                  style={{ color: "#fff", opacity: 0.17, textShadow: "0 0 3px rgba(0,0,0,.7)" }}
                >
                  {`${mark}   ·   ${mark}   ·   ${mark}`}
                </p>
              ))}
            </div>
          </div>
        </div>
        {hidden ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-white">
            <Bloom />
            <p className="mt-24 text-[0.875rem] font-semibold">Фото скрыто</p>
            <p className="text-[0.75rem] text-white/60">Вернитесь в приложение, чтобы посмотреть</p>
          </div>
        ) : null}
      </div>
      <div style={{ height: "calc(env(safe-area-inset-bottom) + 14px)" }} />
    </div>
  );
}

/** Окно перед отправкой: само фото и кнопка «Отправить». */
export function PhotoSend({
  url,
  busy,
  onSend,
  onCancel,
}: {
  url: string;
  busy: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3 pb-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Фото" className="mx-auto max-h-[46dvh] rounded-2xl object-contain" />
      <p className="text-center text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
        Откроется один раз и сразу удалится. Если не откроют за сутки, тоже удалится. Запретить снимок экрана, к сожалению,
        нельзя.
      </p>
      <button
        onClick={onSend}
        disabled={busy}
        className="w-full rounded-2xl py-3 text-[0.9375rem] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
        style={{ background: FEM_GRADIENT }}
      >
        {busy ? "Отправляю…" : "Отправить 📷"}
      </button>
      <button onClick={onCancel} className="w-full rounded-2xl py-3 text-[0.9375rem] font-semibold" style={{ background: "var(--surface-2)" }}>
        Отмена
      </button>
    </div>
  );
}
