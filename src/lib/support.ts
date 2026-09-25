import { createClient } from "@/lib/supabase/client";

/** Одно сообщение переписки с администратором. */
export interface SupportMessage {
  id: number;
  user_id: string;
  from_admin: boolean;
  body: string;
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
    .select("id, user_id, from_admin, body, created_at, read_at")
    .order("created_at");
  if (userId) query = query.eq("user_id", userId);
  const { data } = await query;
  return (data ?? []) as SupportMessage[];
}

/** Отправить. Возвращает текст ошибки или null. */
export async function sendMessage(body: string, asAdminTo?: string): Promise<string | null> {
  const text = body.trim();
  if (!text) return null;
  const { error } = await createClient()
    .from("support_messages")
    .insert(asAdminTo ? { body: text, user_id: asAdminTo, from_admin: true } : { body: text });
  return error ? error.message : null;
}

/** Отметить входящие прочитанными: человеку — ответы, админу — сообщения человека. */
export async function markRead(userId?: string): Promise<void> {
  await createClient().rpc("support_mark_read", userId ? { p_user: userId } : {});
}

export function messageTime(iso: string): string {
  const at = new Date(iso);
  const today = new Date();
  const sameDay = at.toDateString() === today.toDateString();
  return at.toLocaleString("ru-RU", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
