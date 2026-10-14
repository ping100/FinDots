import { createClient } from "@/lib/supabase/client";
import { CURRENT_BUILD } from "@/lib/update";

/**
 * Журнал ошибок: сбои из браузера уходят в базу (log_client_error), админ
 * видит их в админке сгруппированными. Сама база режет поток — не больше
 * 30 записей в час с человека; здесь — ещё и не повторяем одно и то же
 * в пределах вкладки.
 */

/** Шум, который ничего не говорит о нашем коде: сеть, расширения браузера. */
const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch|Load failed|NetworkError|network error/i,
  /AbortError|The operation was aborted/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
];

const sent = new Set<string>();

/** Приложение по адресу: money, tasks, fem, admin или home. */
function appOf(path: string): string {
  const first = path.split("/")[1] ?? "";
  return ["money", "tasks", "fem", "admin"].includes(first) ? first : first ? first : "home";
}

export function logClientError(message: string | undefined, stack?: string) {
  const text = (message ?? "").trim();
  if (!text || NOISE.some((r) => r.test(text) || r.test(stack ?? ""))) return;
  const key = text.slice(0, 200);
  if (sent.has(key) || sent.size >= 20) return;
  sent.add(key);
  const path = typeof location !== "undefined" ? location.pathname : "";
  void createClient()
    .rpc("log_client_error", {
      p_app: appOf(path),
      p_path: path,
      p_message: text,
      p_stack: stack ?? null,
      p_build: CURRENT_BUILD,
      p_ua: typeof navigator !== "undefined" ? navigator.userAgent : null,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}
