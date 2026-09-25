/**
 * Приветствие по времени суток — по часам телефона: у человека утро
 * тогда, когда утро у него, а не у сервера.
 */
export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Доброе утро";
  if (hour >= 12 && hour < 18) return "Здравствуйте";
  if (hour >= 18 && hour < 23) return "Добрый вечер";
  return "Доброй ночи";
}

/**
 * Имя для обращения — только имя, без фамилии: из Google приходит «Имя
 * Фамилия», а «Доброе утро, Иван Петров» звучит как письмо из банка.
 *
 * Без имени при регистрации профиль получает начало почты — «wd-15» — и
 * обращаться так к человеку странно: лучше без имени.
 */
export function addressName(name: string | null | undefined, email: string | null | undefined): string | null {
  const clean = name?.trim();
  if (!clean) return null;
  if (email && clean === email.split("@")[0]) return null;
  return clean.split(/\s+/)[0];
}
