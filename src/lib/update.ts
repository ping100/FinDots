/**
 * Обновление установленного приложения.
 *
 * Страницы service worker не кэширует, но добавленное на экран приложение
 * может жить неделями, ни разу не перезагрузив вкладку, — и человек будет
 * смотреть на старую версию, не понимая, почему обещанного нет. Поэтому
 * приложение само сверяет свой отпечаток сборки с тем, что отдаёт сервер.
 */
export const CURRENT_BUILD = process.env.NEXT_PUBLIC_BUILD ?? "dev";

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
