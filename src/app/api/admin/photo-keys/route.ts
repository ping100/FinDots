import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptApiKey } from "@/lib/aiConfig";

export const runtime = "nodejs";

type Provider = "pixabay" | "pexels";

/** Ключ рабочий? Один пробный поиск «apple». */
async function check(provider: Provider, key: string): Promise<boolean> {
  const res =
    provider === "pixabay"
      ? await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=apple&per_page=3`, { signal: AbortSignal.timeout(8000) }).catch(() => null)
      : await fetch("https://api.pexels.com/v1/search?query=apple&per_page=1", { headers: { Authorization: key }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  return !!res?.ok;
}

/** Ключи фотостоков: что подключено (сами ключи не показываем). */
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_photo_keys");
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 500 });
  return NextResponse.json({ keys: data ?? [] });
}

/** Подключить ключ ({provider, key}) или отключить ({provider, key: null}). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужна авторизация" }, { status: 401 });
  const b = (await request.json().catch(() => null)) as { provider?: string; key?: string | null } | null;
  const provider = b?.provider === "pixabay" || b?.provider === "pexels" ? b.provider : null;
  if (!provider) return NextResponse.json({ error: "Неизвестный фотосток" }, { status: 400 });
  const key = typeof b?.key === "string" ? b.key.trim() : null;
  if (key !== null) {
    if (key.length < 10 || key.length > 200) return NextResponse.json({ error: "Не похоже на ключ" }, { status: 400 });
    if (!(await check(provider, key))) return NextResponse.json({ error: "Фотосток не принял ключ, проверьте, что скопировали его целиком" }, { status: 400 });
  }
  const { error } = await supabase.rpc("admin_photo_key_set", {
    p_provider: provider,
    p_key_enc: key ? encryptApiKey(key) : null,
    p_hint: key ? `…${key.slice(-4)}` : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 500 });
  return NextResponse.json({ ok: true });
}
