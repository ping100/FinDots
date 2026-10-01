import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Удалить все фото переписки — папку "{userId}/" в бакете.
 * Только через Storage API: прямой delete из storage.objects Supabase
 * запрещает триггером protect_objects_delete, да и сам файл так остался бы.
 */
export async function removeThreadAttachments(client: SupabaseClient, userId: string): Promise<void> {
  const bucket = client.storage.from("support-attachments");
  const { data } = await bucket.list(userId, { limit: 1000 });
  if (!data?.length) return;
  await bucket.remove(data.map((file) => `${userId}/${file.name}`));
}
