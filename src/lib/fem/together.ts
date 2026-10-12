/** Статус дня — что она хочет сказать партнёру одним смайликом. */
export const STATUSES: { value: string; emoji: string; label: string }[] = [
  { value: "hug", emoji: "🤗", label: "Обними меня" },
  { value: "attention", emoji: "🥰", label: "Хочу внимания" },
  { value: "great", emoji: "✨", label: "Всё отлично" },
  { value: "tired", emoji: "😴", label: "Устала" },
  { value: "sweet", emoji: "🍫", label: "Хочу сладкого" },
  { value: "leave", emoji: "🙃", label: "Лучше не трогать" },
];

/** Что купить по дороге. Те же ключи — в тексте пуша (api/fem-signal). */
export const BUY_ITEMS: { value: string; emoji: string; label: string }[] = [
  { value: "pads", emoji: "🩷", label: "Прокладки" },
  { value: "tampons", emoji: "🌸", label: "Тампоны" },
  { value: "painkiller", emoji: "💊", label: "Обезболивающее" },
  { value: "chocolate", emoji: "🍫", label: "Шоколадку" },
  { value: "tea", emoji: "🍰", label: "Что-нибудь к чаю" },
  { value: "flowers", emoji: "💐", label: "Цветы" },
];

export const statusOf = (value: string | null | undefined) => STATUSES.find((s) => s.value === value) ?? null;
export const itemOf = (value: string | null | undefined) => BUY_ITEMS.find((s) => s.value === value) ?? null;

/** Подпись сигнала — для карточек в приложении. */
export function signalText(kind: string, item: string | null): { emoji: string; text: string } {
  switch (kind) {
    case "care":
      return { emoji: "💗", text: "Нужна забота" };
    case "buy": {
      const it = itemOf(item);
      return { emoji: "🛍", text: `Купи по дороге: ${it ? it.label.toLowerCase() : "что-нибудь вкусное"}` };
    }
    case "alone":
      return { emoji: "🌙", text: "Хочу немного побыть одна" };
    case "heart":
      return { emoji: "❤️", text: "Думаю о тебе" };
    default:
      return { emoji: "🏃", text: "Уже бегу!" };
  }
}

/** «5 мин назад», «вчера в 21:40». */
export function ago(iso: string): string {
  const diff = Math.max(0, Date.now() - Date.parse(iso));
  const min = Math.round(diff / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 12) return `${h} ч назад`;
  const d = new Date(iso);
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return d.toDateString() === new Date().toDateString() ? `сегодня в ${time}` : d.toDateString() === y.toDateString() ? `вчера в ${time}` : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
