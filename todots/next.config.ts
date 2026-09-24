import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // todots живёт внутри репозитория Findots и рядом со своим package-lock.json
  // лежит ещё один, корневой — без явного root Next.js путается, какой из
  // них главный.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
