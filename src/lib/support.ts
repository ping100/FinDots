import { createClient } from "@/lib/supabase/client";
import { removeThreadAttachments } from "@/lib/supportStorage";

const BUCKET = "support-attachments";

/** Одно сообщение переписки с администратором. */
export interface SupportMessage {
  id: number;
  user_id: string;
  from_admin: boolean;
  /** Пусто, если сообщение — только фото. */
  body: string | null;
  attachment_path: string | null;
  created_at: string;
  read_at: string | null;
}

export const SUPPORT_MAX = 2000;

/** Как часто подтягивать новые сообщения, пока переписка открыта. */
export const SUPPORT_POLL = 20_000;

/** Переписка одного человека. RLS сама решает, чья: своя или, для админа, любая. */
export async function loadThread(userId?: string): Promise<SupportMessage[]> {
  let query = createClient()
    .from("support_messages")
    .select("id, user_id, from_admin, body, attachment_path, created_at, read_at")
    .order("created_at");
  if (userId) query = query.eq("user_id", userId);
  const { data } = await query;
  return (data ?? []) as SupportMessage[];
}

/**
 * Отправить — текст, фото или оба сразу. Возвращает текст ошибки или null.
 *
 * Фото заранее лежит в бакете (см. uploadAttachment); сюда передаётся уже
 * готовый путь, не сам файл — запись в support_messages лишь ссылается
 * на него.
 */
export async function sendMessage(
  body: string,
  asAdminTo?: string,
  attachmentPath?: string | null,
): Promise<string | null> {
  const text = body.trim();
  if (!text && !attachmentPath) return null;
  const { error } = await createClient().from("support_messages").insert(
    asAdminTo
      ? { body: text || null, attachment_path: attachmentPath ?? null, user_id: asAdminTo, from_admin: true }
      : { body: text || null, attachment_path: attachmentPath ?? null },
  );
  return error ? error.message : null;
}

/**
 * Загрузить фото в переписку. Путь — "{user_id переписки}/{имя}": у
 * своей переписки это свой же uid, у админа, отвечающего в чужую, —
 * uid адресата (threadUserId), иначе одно обращение разбилось бы на
 * файлы в разных папках и админ не смог бы их прочитать.
 */
export async function uploadAttachment(file: File, threadUserId: string): Promise<{ path: string | null; error: string | null }> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${threadUserId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await createClient().storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
  });
  return error ? { path: null, error: error.message } : { path, error: null };
}

/** Временная ссылка на фото — бакет приватный, постоянных ссылок нет. */
export async function attachmentUrl(path: string): Promise<string | null> {
  const { data } = await createClient().storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Отметить входящие прочитанными: человеку — ответы, админу — сообщения человека. */
export async function markRead(userId?: string): Promise<void> {
  await createClient().rpc("support_mark_read", userId ? { p_user: userId } : {});
}

/**
 * Скрытые переписки: userId → когда скрыли. Если после этой отметки
 * пришло новое сообщение, переписка сама возвращается в список —
 * решает вызывающий код, здесь только сырые отметки.
 */
export async function loadHiddenThreads(): Promise<Map<string, string>> {
  const { data } = await createClient().from("support_thread_state").select("user_id, hidden_at");
  return new Map((data ?? []).map((row) => [row.user_id as string, row.hidden_at as string]));
}

export async function setThreadHidden(userId: string, hidden: boolean): Promise<string | null> {
  const { error } = await createClient().rpc("admin_set_thread_hidden", {
    p_user_id: userId,
    p_hidden: hidden,
  });
  return error ? error.message : null;
}

/** Удалить переписку целиком. notify — оставить одно сообщение о закрытии (и разбудить пуш). */
export async function closeThread(userId: string, notify: boolean): Promise<string | null> {
  const client = createClient();
  // Не удалось стереть фото — переписку всё равно закрываем: лишний файл
  // в бакете меньшее зло, чем обращение, которое не закрывается.
  await removeThreadAttachments(client, userId).catch(() => undefined);
  const { error } = await client.rpc("admin_close_thread", {
    p_user_id: userId,
    p_notify: notify,
  });
  return error ? error.message : null;
}

/**
 * Удалить переписку и прислать push «Обращение закрыто» напрямую, минуя
 * support_messages, — в базе после этого не остаётся ни одной строки.
 * Дойдёт, только если у человека включены уведомления.
 */
export async function closeThreadWithPush(userId: string): Promise<string | null> {
  const res = await fetch("/api/admin/close-thread", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}) as { error?: string });
  return data.error ?? "Не получилось";
}

/** Последний непрочитанный ответ администратора — для баннера при входе. */
export interface UnreadReply {
  id: number;
  body: string;
  /** Сколько всего непрочитанных ответов — не только этот. */
  count: number;
}

export async function latestUnreadReply(): Promise<UnreadReply | null> {
  const { data, count } = await createClient()
    .from("support_messages")
    .select("id, body, attachment_path", { count: "exact" })
    .eq("from_admin", true)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  return { id: row.id, body: row.body ?? (row.attachment_path ? "📷 Фото" : ""), count: count ?? 1 };
}

export function messageTime(iso: string): string {
  const at = new Date(iso);
  const today = new Date();
  const sameDay = at.toDateString() === today.toDateString();
  return at.toLocaleString("ru-RU", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
