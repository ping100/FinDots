import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// /api/version отдаёт только отпечаток сборки и нужен до входа тоже: иначе
// проверка обновления на экране логина молча упиралась бы в редирект.
// /api/models — открытый каталог моделей OpenRouter, личного в нём ничего
// нет, а ответ кэшируется на час, так что скрывать его не за чем.
// /api/reminders, /api/support-reply и /api/fem-signal зовёт база, а не человек: там своя
// проверка — по секрету.
const PUBLIC_PATHS = [
  "/login",
  "/auth",
  "/privacy",
  "/terms",
  "/api/version",
  "/api/models",
  "/api/reminders",
  "/api/support-reply",
  // Зовёт сама база (уведомления админу); маршрут сам проверяет секрет.
  "/api/admin-alert",
  "/api/fem-signal",
  "/api/fem-hints",
  // Кнопки в уведомлении: маршрут сам проверяет вход и отвечает 401, а не
  // уводит на страницу входа — service worker ждёт JSON.
  "/api/fem-act",
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Главная гостю — лендинг (решает сама страница), поэтому открыта. Только
  // ровно «/»: startsWith("/") открыл бы всё.
  const isPublic =
    request.nextUrl.pathname === "/" || PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Куда шёл — чтобы вернуть туда после входа. На главную и так
    // вернёт, и «?next=%2F» в адресе только уродует ссылку, которой
    // человек потом делится.
    // С параметрами: в ссылке-приглашении FemDots (/fem/join?code=…) код
    // и есть суть — без него после входа приглашение потерялось бы.
    url.search = "";
    if (request.nextUrl.pathname !== "/") {
      url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|pdf.worker.min.mjs|icons/.*|.*\\.(?:png|svg|jpg|webp)$).*)",
  ],
};
