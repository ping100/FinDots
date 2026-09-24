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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD: BUILD, NEXT_PUBLIC_BUILT_AT: BUILT_AT },
};

export default nextConfig;
