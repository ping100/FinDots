/**
 * Админка: форма сводки из базы и лимиты бесплатных тарифов.
 *
 * Лимиты взяты из документации Supabase на сентябрь 2026 года. Меняются они
 * редко, но меняются — поэтому живут одной табличкой, а не разбросаны по
 * разметке.
 */
export interface AdminUser {
  id: string;
  /** Порядковый номер: 1, 2, 3… — его человек видит у себя в настройках. */
  number: number | null;
  email: string | null;
  display_name: string | null;
  created_at: string;
  last_seen: string | null;
  /** Последняя отметка «я здесь» из открытого приложения. */
  online_at: string | null;
  providers: string[];
  /** Почта привязанного Google; null — Google не привязан. */
  google_email: string | null;
  /** Картинка профиля Google. */
  avatar_url: string | null;
  wallets: number;
  transactions: number;
  tasks_open: number;
  tasks_done: number;
  has_ai_key: boolean;
  ai_calls: number;
}

export interface AdminOverview {
  generated_at: string;
  users: AdminUser[];
  totals: {
    online: number;
    users: number;
    new_7d: number;
    new_30d: number;
    active_7d: number;
    active_30d: number;
    money_users: number;
    tasks_users: number;
    transactions: number;
    tasks: number;
  };
  database: { size_bytes: number; tables: { name: string; bytes: number; rows: number }[] };
  storage: { size_bytes: number; files: number };
}

const MB = 1024 * 1024;

/** Бесплатный тариф Supabase. */
export const SUPABASE_FREE = {
  databaseBytes: 500 * MB,
  storageBytes: 1024 * MB,
  monthlyActiveUsers: 50_000,
};

/** Где смотреть то, чего из базы не посчитать. */
export const LINKS = {
  supabaseUsage: "https://supabase.com/dashboard/org/gnpxijeszqfygrofhqxe/usage",
  vercelUsage: "https://vercel.com/mars26",
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < MB) return `${(bytes / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} КБ`;
  if (bytes < 1024 * MB) return `${(bytes / MB).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
  return `${(bytes / 1024 / MB).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ГБ`;
}

/** «сегодня», «вчера», «3 дня назад», дальше — датой. */
export function sinceLabel(iso: string | null, now = new Date()): string {
  if (!iso) return "ни разу";
  const at = new Date(iso);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) return `${days} ${plural(days, "день", "дня", "дней")} назад`;
  return at.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/**
 * Насколько близко к пределу. Цвет тут не единственный сигнал — к нему
 * всегда приложено слово: полоса одного оттенка для человека с нарушенным
 * цветовым зрением ничего не значит.
 */
export function pressure(share: number): { color: string; word: string | null } {
  if (share >= 1) return { color: "var(--danger)", word: "лимит превышен" };
  if (share >= 0.8) return { color: "#f59e0b", word: "близко к пределу" };
  return { color: "var(--accent)", word: null };
}

const DAY = 86_400_000;
/** Приложение отмечается раз в минуту; две минуты — с запасом на одну пропущенную. */
const ONLINE_WINDOW = 2 * 60_000;
/** Как часто админка на экране сама перезапрашивает сводку. */
export const REFRESH = 30_000;

/**
 * «Сейчас» — момент, когда база собрала сводку, а не часы телефона: они
 * могут уйти на минуту-другую, и онлайн-статус начал бы врать.
 */
function within(iso: string | null, now: number, ms: number): boolean {
  return iso !== null && now - new Date(iso).getTime() < ms;
}

export function isOnline(u: AdminUser, now: number): boolean {
  return within(u.online_at, now, ONLINE_WINDOW);
}

/**
 * Списки пользователей. Плитки на главной админки считают тем же
 * правилом, что и список за ними: иначе на плитке «4», а в списке трое —
 * и непонятно, кто из них врёт.
 */
export const VIEWS = {
  all: { label: "Всего пользователей", title: "Все пользователи", chip: "Все", test: () => true },
  online: { label: "Онлайн сейчас", title: "Онлайн сейчас", chip: "Онлайн", test: isOnline },
  new_7d: {
    label: "Новых за неделю",
    title: "Новые за неделю",
    chip: "Новые",
    test: (u, now) => within(u.created_at, now, 7 * DAY),
  },
  active_30d: {
    label: "Активных за месяц",
    title: "Активные за месяц",
    chip: "Активные",
    test: (u, now) => within(u.last_seen, now, 30 * DAY),
  },
  money: { label: "Деньгами пользуются", title: "Пользуются деньгами", chip: "Деньги", test: (u) => u.transactions > 0 },
  tasks: {
    label: "Задачами пользуются",
    title: "Пользуются задачами",
    chip: "Задачи",
    test: (u) => u.tasks_open + u.tasks_done > 0,
  },
} satisfies Record<string, { label: string; title: string; chip: string; test: (u: AdminUser, now: number) => boolean }>;

export type ViewId = keyof typeof VIEWS;

export function isView(value: unknown): value is ViewId {
  return typeof value === "string" && Object.hasOwn(VIEWS, value);
}

export function countView(data: AdminOverview, id: ViewId): number {
  const now = new Date(data.generated_at).getTime();
  return data.users.filter((u) => VIEWS[id].test(u, now)).length;
}
