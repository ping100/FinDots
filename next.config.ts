import type { NextConfig } from "next";

/**
 * Отпечаток сборки. На Vercel это короткий хеш коммита, локально — время
 * сборки. По нему приложение понимает, что на сервере лежит уже другая
 * версия, и предлагает обновиться. Человеку он не показывается.
 */
const BUILD =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  new Date().toISOString().slice(0, 16).replace("T", " ");

/**
 * Время сборки — это и есть «когда обновлялись». Его и показываем в
 * настройках: дата человеку говорит больше, чем семь знаков хеша.
 */
const BUILT_AT = new Date().toISOString();

/**
 * Заголовки безопасности на все ответы.
 *
 * Главное — запрет открывать приложение внутри чужой страницы: иначе его
 * можно спрятать под приманку, и человек, думая, что жмёт на чужую кнопку,
 * нажмёт на кнопку в своих финансах. Остальное — браузер не угадывает тип
 * файлов, не рассказывает чужим сайтам полный адрес страницы и не даёт
 * странице камеру и микрофон — они приложению не нужны. Геолокация —
 * только самому приложению (погода на главной, и то после «Разрешить»),
 * встроенным чужим страницам — нет.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_BUILD: BUILD, NEXT_PUBLIC_BUILT_AT: BUILT_AT },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
