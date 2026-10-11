import type { User } from "@supabase/supabase-js";

/**
 * Версия Соглашения и Политики, на которую человек дал согласие.
 * Поменяли текст по существу — меняем версию, и при следующем входе
 * приложение попросит принять заново.
 */
export const TERMS_VERSION = "2026-10-11";

/** Дата для заголовков страниц — та же редакция, что TERMS_VERSION. */
export const TERMS_UPDATED = "11 октября 2026 года";

/**
 * Галочки отметили до ухода на Google: после возврата отметку можно
 * записать без второго окна согласия.
 */
export const CONSENT_PENDING_KEY = "dots:consent-pending";

/** Согласие хранится в метаданных учётной записи — с датой и версией. */
export function consentMetadata() {
  return { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() };
}

export function hasConsent(user: User | null | undefined): boolean {
  return user?.user_metadata?.terms_version === TERMS_VERSION;
}
