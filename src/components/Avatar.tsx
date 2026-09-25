"use client";

import { useState } from "react";

const COLORS = ["#22c55e", "#60a5fa", "#f97316", "#a855f7", "#ec4899", "#14b8a6", "#eab308"];

/**
 * Аватарка: картинка из Google, а без неё — первая буква имени на цветном
 * круге. Цвет выбирается по имени, чтобы у человека он был всегда один.
 *
 * Картинка грузится с серверов Google без адреса нашей страницы
 * (no-referrer): Google иначе порой отказывает в ней, да и знать, откуда
 * её смотрят, ему незачем.
 */
export function Avatar({ url, name, size = 40 }: { url?: string | null; name?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const letter = (name?.trim()[0] ?? "?").toUpperCase();
  const color = COLORS[[...(name ?? "")].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % COLORS.length];

  if (url && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- внешняя картинка малого размера, оптимизатор Next ей не нужен
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {letter}
    </span>
  );
}
