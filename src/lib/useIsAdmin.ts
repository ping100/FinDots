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
    asked ??= (async () => {
      const supabase = createClient();
      // Компонент теперь монтируется и на входе, и на публичных страницах —
      // без сессии спрашивать базу незачем, и так понятно, что не админ.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return false;
      const { data } = await supabase.rpc("is_admin");
      return data === true;
    })().catch(() => false);
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
