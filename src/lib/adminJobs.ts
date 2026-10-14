/** Фоновые задачи: человеческие названия и признак «встала» — общие для пульта и экрана задач. */

export interface Job {
  name: string;
  schedule: string;
  active: boolean;
  last_start: string | null;
  last_status: string | null;
  last_message: string | null;
  runs_24h: number;
  fails_24h: number;
}

export interface CronStatus {
  jobs: Job[];
  http_total_24h: number;
  http_bad_24h: number;
  http_last_bad: { at: string; status: number | null; text: string | null } | null;
}

export const JOB_NAMES: Record<string, string> = {
  "task-reminders": "Напоминания о задачах",
  "purge-cron-history": "Чистка журнала задач",
  "bill-reminders": "Напоминания о платежах",
  "wellness-reminders": "Вода и сон",
  "carry-over-tasks": "Перенос несделанного на завтра",
  "task-summaries": "Утренняя сводка задач",
  "fem-reminders": "FemDots: напоминания",
  "fem-partner-reminders": "FemDots: напоминания партнёру",
  "fem-pill-nudges": "FemDots: таблетка",
  "admin-watch": "Сторож админки (раз в час)",
  "admin-daily": "Утренняя сводка админу",
};

/** Как часто задача должна запускаться, в минутах — по расписанию cron. */
export function everyMinutes(schedule: string): number {
  const [m, h] = schedule.split(" ");
  if (m === "*") return 1;
  if (m.startsWith("*/")) return Number(m.slice(2)) || 60;
  if (h === "*") return 60;
  return 24 * 60;
}

/** Встала: давно не запускалась — дольше трёх своих интервалов. */
export function isStale(job: Job, now = Date.now()): boolean {
  if (!job.active) return false;
  if (!job.last_start) return true;
  return now - new Date(job.last_start).getTime() > (everyMinutes(job.schedule) * 3 + 5) * 60_000;
}

/** «12 мин назад», «1 ч 35 мин назад», «2 дн назад». */
export function agoText(iso: string | null): string {
  if (!iso) return "ни разу";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} ч ${min % 60 ? `${min % 60} мин ` : ""}назад`;
  return `${Math.floor(min / 1440)} дн назад`;
}
