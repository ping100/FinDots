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

/** Свой статус или просьба хранятся как «смайлик|текст» (статус — с приставкой «c:»). */
export const packCustom = (emoji: string, label: string) => `${emoji}|${label}`;
export function unpackCustom(raw: string | null | undefined): { emoji: string; label: string } | null {
  if (!raw) return null;
  const i = raw.indexOf("|");
  return i > 0 ? { emoji: raw.slice(0, i), label: raw.slice(i + 1) } : null;
}

export const statusOf = (value: string | null | undefined): { value: string; emoji: string; label: string } | null => {
  if (value?.startsWith("c:")) {
    const c = unpackCustom(value.slice(2));
    return c ? { value, ...c } : null;
  }
  return STATUSES.find((s) => s.value === value) ?? null;
};

/** Смайлики на выбор для своих статусов и просьб. */
export const EMOJI_CHOICES = ["💗", "🤗", "😴", "🍫", "☕", "🍕", "🎬", "🛁", "🌧️", "🌸", "🥺", "😤", "🔥", "🧸", "💐", "🚶‍♀️"];
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
    case "custom": {
      const c = unpackCustom(item);
      return { emoji: c?.emoji ?? "💌", text: c?.label ?? "Просьба" };
    }
    case "reply":
      return { emoji: "💬", text: item ?? "Ответ" };
    case "done":
      return { emoji: "✅", text: item ?? "Готово" };
    case "will":
      return { emoji: "💗", text: `Позаботится: ${lower(item ?? "о вас")}` };
    case "invite": {
      const inv = unpackInvite(item);
      return { emoji: "💌", text: inv ? `Зовёт: ${inv.emoji} ${inv.label}` : "Зовёт провести вечер вместе" };
    }
    case "intim":
      return { emoji: "🤍", text: "Отметил близость — подтвердите" };
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

const lower = (t: string) => (t ? t[0].toLowerCase() + t.slice(1) : t);

// ───────────────────────────── ответы ─────────────────────────────

/** Готовый ответ: act — его код (для кнопок в уведомлении), done — «готово». */
export interface ReplyPreset {
  act: string;
  text: string;
  done?: boolean;
}

/**
 * Три готовых ответа на каждый вид сигнала. Те же коды понимает сервер
 * (кнопки в уведомлении шлют код, а не текст).
 */
export const REPLIES: Record<string, ReplyPreset[]> = {
  care: [
    { act: "run", text: "Уже бегу 🏃" },
    { act: "soon", text: "Буду через 20 минут" },
    { act: "call", text: "Позвоню через минуту 📞" },
  ],
  buy: [
    { act: "run", text: "Куплю, уже еду 🛍" },
    { act: "soon", text: "Буду через 20 минут" },
    { act: "bought", text: "Купил ✅", done: true },
  ],
  custom: [
    { act: "run", text: "Уже бегу 🏃" },
    { act: "soon", text: "Буду через 20 минут" },
    { act: "later", text: "Сейчас не могу, чуть позже 🙏" },
  ],
  alone: [
    { act: "ok", text: "Понял 👌" },
    { act: "near", text: "Я рядом, если что 💗" },
    { act: "wait", text: "Напиши, когда захочешь" },
  ],
  heart: [
    { act: "metoo", text: "И я ❤️" },
    { act: "miss", text: "Скучаю 🥺" },
    { act: "hug", text: "Обнимаю 🤗" },
  ],
  invite: [
    { act: "yes", text: "Да! 💗" },
    { act: "other", text: "Давай в другой день" },
    { act: "no", text: "Не сегодня 🙏" },
  ],
  will: [
    { act: "thanks", text: "Спасибо 💗" },
    { act: "best", text: "Ты лучший 🥰" },
    { act: "nice", text: "Не обязательно, но приятно 🙂" },
  ],
};

/** Чем отметить, что просьба выполнена. */
export const doneText = (kind: string) => (kind === "buy" ? "Купил ✅" : "Готово ✅");

/** Просьбы, у которых есть ход «бежит → готово». */
export const ERRANDS = new Set(["care", "buy", "custom"]);

// ───────────────────────────── «что она любит» ─────────────────────────────

export const LIKES: { key: string; emoji: string; label: string; hint: string }[] = [
  { key: "sweet", emoji: "🍫", label: "Сладкое", hint: "Молочный шоколад, эклеры" },
  { key: "flowers", emoji: "💐", label: "Цветы", hint: "Пионы, тюльпаны" },
  { key: "drink", emoji: "☕", label: "Напитки", hint: "Латте на овсяном, чай с имбирём" },
  { key: "food", emoji: "🍕", label: "Еда", hint: "Суши, паста с креветками" },
  { key: "pain", emoji: "🌡️", label: "Когда болит", hint: "Грелка, плед, но-шпа" },
  { key: "joy", emoji: "🎁", label: "Чем порадовать", hint: "Книги, свечи, прогулка у воды" },
  { key: "no", emoji: "🙅‍♀️", label: "Не люблю", hint: "Горький шоколад, лилии" },
];
export type Likes = Partial<Record<string, string>>;

/** Что из «любит» подсказать к просьбе «купи». */
export const LIKE_FOR_ITEM: Record<string, string> = {
  chocolate: "sweet",
  tea: "sweet",
  flowers: "flowers",
  painkiller: "pain",
};

// ───────────────────────────── приглашения ─────────────────────────────

export const INVITE_IDEAS: { emoji: string; label: string }[] = [
  { emoji: "🎬", label: "Кино" },
  { emoji: "🍝", label: "Ужин" },
  { emoji: "🚶", label: "Прогулка" },
  { emoji: "🛋️", label: "Вечер дома" },
  { emoji: "☕", label: "Кофе" },
  { emoji: "🎳", label: "Развлечься" },
];

/** Приглашение хранится строкой «смайлик|что|день|время». */
export const packInvite = (emoji: string, label: string, day: string, time: string | null) =>
  `${emoji}|${label.replace(/\|/g, " ")}|${day}|${time ?? ""}`;
export function unpackInvite(raw: string | null | undefined): { emoji: string; label: string; day: string; time: string | null } | null {
  const parts = (raw ?? "").split("|");
  if (parts.length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(parts[2])) return null;
  return { emoji: parts[0], label: parts[1], day: parts[2], time: parts[3] || null };
}

const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"];

/** «сегодня в 19:00», «завтра», «в пятницу 17 окт.». */
export function whenText(day: string, time: string | null, today: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
  const date = new Date(y, m - 1, d);
  const base =
    diff === 0
      ? "сегодня"
      : diff === 1
        ? "завтра"
        : diff > 1 && diff < 7
          ? `в ${WEEKDAYS[date.getDay()]}`
          : date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  return time ? `${base} в ${time}` : base;
}

// ───────────────────────────── близость ─────────────────────────────

/** Предложение отметки: «день|виды|защита». */
export function unpackIntim(raw: string | null | undefined): { day: string; kinds: string[]; protected: boolean | null } | null {
  const [day, kinds, prot] = (raw ?? "").split("|");
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return { day, kinds: kinds ? kinds.split(",") : [], protected: prot === "true" ? true : prot === "false" ? false : null };
}
