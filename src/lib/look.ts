/**
 * Внешний вид до загрузки данных.
 *
 * Тема и кегль живут в профиле, чтобы переезжать между устройствами, но
 * профиль приходит из базы, а это секунда-две. Всё это время человек с
 * тёмной темой смотрел на белый экран ожидания, а потом получал вспышку
 * перекраски. Поэтому выбранное запоминаем ещё и на самом устройстве и
 * применяем до первой отрисовки.
 */
export const THEME_KEY = "dots.theme";
export const SCALE_KEY = "dots.scale";

export const BACKGROUNDS = { light: "#f2f2f7", dark: "#0b0f16" };

/** «system» — как на телефоне, и вслед за ним при смене на лету. */
export type ThemeChoice = "light" | "dark" | "system";

export const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: "light", label: "Светлая" },
  { id: "dark", label: "Тёмная" },
  { id: "system", label: "Авто" },
];

export const THEME_AUTO_HINT = "Авто — как на телефоне: светлая или тёмная вслед за системной темой.";

export const SYSTEM_DARK = "(prefers-color-scheme: dark)";

/** Покрасить страницу: класс на html и цвет строки состояния. */
export function paintTheme(choice: ThemeChoice | string | null): void {
  const dark = choice === "dark" || ((!choice || choice === "system") && matchMedia(SYSTEM_DARK).matches);
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? BACKGROUNDS.dark : BACKGROUNDS.light);
}

/**
 * Поставить вид из профиля и запомнить его на устройстве. Общая для денег
 * и задач: профиль у них один, и вид должен быть один.
 */
export function applyLook(theme: ThemeChoice, fontSize: string): void {
  paintTheme(theme);
  document.documentElement.style.fontSize = fontSize;
  rememberLook(theme, fontSize);
}

/** Запомнить выбор на этом устройстве. Приватный режим молча игнорируем. */
export function rememberLook(theme: string | undefined, fontSize: string): void {
  try {
    if (theme) localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(SCALE_KEY, fontSize);
  } catch {
    // Хранилище может быть закрыто настройками браузера — не беда,
    // профиль всё равно приедет и тему поставит.
  }
}

/** Что запомнено на этом устройстве; null — ничего. */
export function rememberedTheme(): string | null {
  try {
    return localStorage.getItem(THEME_KEY) ?? localStorage.getItem("findots.theme");
  } catch {
    return null;
  }
}

/**
 * Скрипт, который выполняется до первой отрисовки страницы.
 *
 * Отдаётся строкой и вставляется в <head> — только так можно покрасить
 * страницу раньше, чем её увидят. React здесь ещё не работает, поэтому
 * обычный код на месте: ни импортов, ни зависимостей.
 */
export const LOOK_SCRIPT = `
try {
  var d = document.documentElement;
  var t = localStorage.getItem(${JSON.stringify(THEME_KEY)}) || localStorage.getItem("findots.theme");
  if (!t || t === 'system') t = matchMedia(${JSON.stringify(SYSTEM_DARK)}).matches ? 'dark' : 'light';
  if (t === 'dark') d.classList.add('dark');
  var s = localStorage.getItem(${JSON.stringify(SCALE_KEY)}) || localStorage.getItem("findots.scale");
  if (s) d.style.fontSize = s;
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'dark' ? ${JSON.stringify(BACKGROUNDS.dark)} : ${JSON.stringify(BACKGROUNDS.light)});
} catch (e) {}
`.trim();
