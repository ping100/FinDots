"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export interface Me {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
}

/** Картинка профиля Google — если Google привязан. */
export function avatarOf(user: User): string | null {
  const google = user.identities?.find((item) => item.provider === "google");
  const data = google?.identity_data ?? {};
  const url = (data.avatar_url ?? data.picture) as string | undefined;
  return url || null;
}

/**
 * Кто вошёл: почта, имя из профиля и аватарка. Для экранов без данных
 * приложений — развилки и настроек-карточки.
 */
export function useMe(): { me: Me | null; reload: () => void } {
  const [me, setMe] = useState<Me | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    setMe({ id: user.id, email: user.email ?? null, name: profile?.display_name ?? null, avatar: avatarOf(user) });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { me, reload: () => void load() };
}
