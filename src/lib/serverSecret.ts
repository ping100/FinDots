import { timingSafeEqual } from "node:crypto";

/**
 * Сравнение секрета из заголовка запроса с тем, что знает сервер —
 * без утечки через то, сколько это сравнение заняло по времени.
 *
 * Общее для ручек, которые вызывает не человек, а сама база (pg_net):
 * напоминания о задачах и пуш на ответ администратора используют один и
 * тот же секрет (REMINDERS_SECRET в Vercel, reminders_secret в Vault).
 */
export function sameSecret(given: string, expected: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
