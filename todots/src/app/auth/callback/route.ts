import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Куда можно уводить после возврата.
 *
 * Адрес приходит из ссылки, а её может подсунуть кто угодно. Без проверки
 * «//evil.example» склеилось бы с нашим доменом в ссылку на чужой сайт — и
 * человек, кликнувший по письму от нас, оказался бы там, доверяя адресу, с
 * которого пришёл. Поэтому пускаем только свои пути: одна косая черта в
 * начале и ни одной сразу за ней.
 */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

/** Возврат из письма-подтверждения или от Google: меняем код на сессию. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
