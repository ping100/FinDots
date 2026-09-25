"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => setHello(greeting()), []);

  const name = me ? addressName(me.name, me.email) : null;

  return (
    <div className="mt-2 flex min-h-8 items-center justify-center gap-2">
      {hello && me ? (
        <p className="animate-fade flex items-center gap-2 text-[1rem] font-medium">
          {me.avatar ? <Avatar url={me.avatar} name={name ?? me.email} size={26} /> : null}
          {name ? `${hello}, ${name}` : `${hello}!`}
        </p>
      ) : null}
    </div>
  );
}
