import type { NextConfig } from "next";

/**
 * Отпечаток сборки. На Vercel это короткий хеш коммита, локально — время
 * сборки. По нему приложение понимает, что на сервере лежит уже другая
 * версия, и предлагает обновиться.
 */
const BUILD =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  new Date().toISOString().slice(0, 16).replace("T", " ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD: BUILD },
};

export default nextConfig;
