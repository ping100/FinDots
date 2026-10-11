"use client";

import { useEffect, useRef, useState } from "react";
import { addressName, greeting } from "@/lib/greeting";
import { useMe } from "@/lib/me";
import { Avatar } from "./Avatar";

/**
 * «Доброе утро, Алиса» на развилке. Время суток берём только в браузере:
 * на сервере его часы и часовой пояс — не человека, и приветствие
 * не совпало бы с его утром.
 */
export function Greeting() {
  const { me } = useMe();
  const [hello, setHello] = useState<string | null>(null);

  // Приветствие идёт следом за названием «Dots» (его задержка — 700 мс от
  // появления страницы). Если данные о человеке пришли позже, ждать уже
  // нечего — показываем сразу.
  const mountedAt = useRef(0);
  const [delay, setDelay] = useState<number | null>(null);
  useEffect(() => {
    mountedAt.current = Date.now();
    setHello(greeting());
  }, []);
  useEffect(() => {
    if (me) setDelay((d) => d ?? Math.max(0, 780 - (Date.now() - mountedAt.current)));
  }, [me]);

  const name = me ? addressName(me.name, me.email) : null;

  return (
    <div className="mt-2 flex min-h-8 items-center justify-center gap-2">
      {hello && me && delay !== null ? (
        // Не раньше названия над ним: на главной знак собирается долго, и
        // приветствие, вынырнувшее первым, повисало бы в пустоте.
        <p className="animate-lift flex items-center gap-2 text-[1rem] font-medium" style={{ animationDelay: `${delay}ms` }}>
          {me.avatar ? <Avatar url={me.avatar} name={name ?? me.email} size={26} /> : null}
          {name ? `${hello}, ${name}` : `${hello}!`}
        </p>
      ) : null}
    </div>
  );
}
