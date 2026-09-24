import { NextResponse } from "next/server";

// Всегда мимо кэша: это единственный ответ, по которому приложение узнаёт,
// что на сервере уже другая сборка.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { build: process.env.NEXT_PUBLIC_BUILD ?? "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
