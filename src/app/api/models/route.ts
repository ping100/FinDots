import { NextResponse } from "next/server";

/**
 * Список моделей OpenRouter.
 *
 * Зашитый в код список протухает: за полгода четыре бесплатные модели из
 * него исчезли, и разбор бюджета отвечал «404», не объясняя почему. Поэтому
 * список берём у OpenRouter живьём. Ключ для этого не нужен — ответ
 * публичный, так что запрос идёт от сервера и ничей ключ не светится.
 */
export const revalidate = 3600;

interface Model {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}

export async function GET() {
  let data: { data?: Model[] };
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch {
    return NextResponse.json({ error: "Не удалось получить список моделей" }, { status: 502 });
  }

  const models = (data.data ?? [])
    .map((m) => ({
      id: m.id,
      label: (m.name ?? m.id).replace(/\s*\(free\)\s*$/i, ""),
      // Бесплатные помечены суффиксом в идентификаторе, и это надёжнее, чем
      // разбирать цены строками.
      free: m.id.endsWith(":free"),
      context: m.context_length ?? 0,
    }))
    // Совсем короткий контекст не подходит: сводка бюджета в него не влезет.
    .filter((m) => m.context >= 16000)
    .sort((a, b) => Number(b.free) - Number(a.free) || b.context - a.context);

  return NextResponse.json({ models });
}
