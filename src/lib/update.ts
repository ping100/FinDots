/**
 * Обновление установленного приложения.
 *
 * Страницы service worker не кэширует, но добавленное на экран приложение
 * может жить неделями, ни разу не перезагрузив вкладку, — и человек будет
 * смотреть на старую версию, не понимая, почему обещанного нет. Поэтому
 * приложение само сверяет свой отпечаток сборки с тем, что отдаёт сервер.
 */
export const CURRENT_BUILD = process.env.NEXT_PUBLIC_BUILD ?? "dev";

/**
 * Когда собрана версия, которая сейчас открыта, — по-человечески.
 *
 * Считать это можно только в браузере: время переводится в часовой пояс
 * читателя, а он у сервера и у телефона разный. Посчитай мы строку при
 * отрисовке на сервере — React увидел бы расхождение и ругнулся.
 */
export function buildMoment(now = new Date()): string | null {
  const raw = process.env.NEXT_PUBLIC_BUILT_AT;
  if (!raw) return null;
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return null;

  const day = (d: Date) => d.toLocaleDateString("ru-RU");
  const time = at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  if (day(at) === day(now)) return `сегодня, ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day(at) === day(yesterday)) return `вчера, ${time}`;

  // Давние сборки — просто датой: час в них уже никому не интересен.
  return at.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Отпечаток сборки на сервере; null — не дозвонились (нет сети). */
export async function serverBuild(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { build?: string };
    return data.build ?? null;
  } catch {
    return null;
  }
}

export async function updateAvailable(): Promise<boolean> {
  const build = await serverBuild();
  return !!build && build !== CURRENT_BUILD;
}

/**
 * Забрать новую версию: обновить service worker, выкинуть кэш статики и
 * перезагрузиться. Без чистки кэша остались бы старые файлы сборки.
 */
export async function applyUpdate(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update().catch(() => {})));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Даже если почистить не вышло, перезагрузка всё равно нужна.
  }
  location.reload();
}
