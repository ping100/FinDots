"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Админ ли вошедший — один запрос на всю вкладку. Спрашивают несколько
 * мест сразу (ссылка на админку, обращения, карточка на развилке), а ответ
 * за время жизни вкладки не меняется.
 *
 * Это только про то, что показать. Пускает к данным админки сама база.
 */
let asked: Promise<boolean> | null = null;

export function useIsAdmin(): boolean | null {
  const [admin, setAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    asked ??= Promise.resolve(createClient().rpc("is_admin")).then(({ data }) => data === true, () => false);
    // Неудачный ответ не запоминаем: иначе сбой сети спрятал бы админку
    // до перезагрузки.
    asked.then((value) => {
      if (alive) setAdmin(value);
      if (!value) asked = null;
    });
    return () => {
      alive = false;
    };
  }, []);

  return admin;
}
