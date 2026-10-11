"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { CurrencyCode } from "@/lib/types";

/**
 * Сумма, которая не перескакивает, а досчитывает до нового значения:
 * перенесли деньги — «Свободно» плавно уменьшается, и видно, что именно
 * изменилось. При первом показе отсчёт идёт от нуля.
 */
export function AnimatedMoney({
  value,
  currency,
  duration = 650,
}: {
  value: number;
  currency: CurrencyCode;
  duration?: number;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    const start = from.current;
    if (start === value || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const began = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / duration);
      // Быстро вначале, мягко в конце — как стрелка весов.
      const eased = 1 - Math.pow(1 - t, 3);
      const current = start + (value - start) * eased;
      from.current = current;
      // Промежуточные — целыми: копейки, мелькающие на лету, только рябят.
      setShown(t < 1 ? Math.round(current) : value);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value, duration]);

  return <>{formatMoney(shown, currency)}</>;
}
