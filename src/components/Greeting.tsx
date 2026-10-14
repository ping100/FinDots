"use client";

import { useEffect, useRef, useState } from "react";
import { addressName, greeting } from "@/lib/greeting";
import { useMe } from "@/lib/me";
import { Avatar } from "./Avatar";

/**
 * «Доброе утро, Алиса» и дата на развилке. Время суток берём только в браузере:
 * на сервере его часы и часовой пояс — не человека, и приветствие
 * не совпало бы с его утром.
 */
export function Greeting() {
  const { me } = useMe();
  const [hello, setHello] = useState<string | null>(null);

  // Приветствие проявляется первым, чуть погодя после неба. Если данные о
  // человеке пришли позже, ждать уже нечего — показываем сразу.
  const mountedAt = useRef(0);
  const [delay, setDelay] = useState<number | null>(null);
  useEffect(() => {
    mountedAt.current = Date.now();
    setHello(greeting());
  }, []);
  useEffect(() => {
    if (me) setDelay((d) => d ?? Math.max(0, 300 - (Date.now() - mountedAt.current)));
  }, [me]);

  const name = me ? addressName(me.name, me.email) : null;

  // Дата — тоже по часам телефона, поэтому только в браузере.
  const date = hello
    ? new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase())
    : null;

  return (
    <div className="flex min-h-[3.75rem] flex-col items-center justify-center">
      {hello && me && delay !== null ? (
        <div className="animate-lift flex flex-col items-center" style={{ animationDelay: `${delay}ms` }}>
          <p className="text-[0.8125rem]" style={{ color: "var(--ink-2, var(--muted))" }}>
            {date}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center justify-center gap-x-2 text-center text-[1.5rem] font-bold leading-tight tracking-tight">
            {me.avatar ? <Avatar url={me.avatar} name={name ?? me.email} size={28} /> : null}
            {name ? `${hello}, ${name}` : `${hello}!`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
