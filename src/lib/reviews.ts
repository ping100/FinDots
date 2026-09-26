import { createClient } from "@/lib/supabase/client";

/** Один отзыв: оценка 1–5 и необязательный текст. */
export interface Review {
  id: number;
  user_id: string;
  rating: number;
  body: string | null;
  created_at: string;
}

export const REVIEW_MAX = 2000;

/** Отправить отзыв. Возвращает текст ошибки или null при успехе. */
export async function submitReview(rating: number, body: string): Promise<string | null> {
  const text = body.trim();
  const { error } = await createClient()
    .from("reviews")
    .insert({ rating, body: text || null });
  return error ? error.message : null;
}

/** Все отзывы — RLS отдаёт их целиком только администратору. */
export async function loadReviews(): Promise<Review[]> {
  const { data } = await createClient()
    .from("reviews")
    .select("id, user_id, rating, body, created_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as Review[];
}

/** Удалить отзыв. reviews неизменяема для всех — только через админскую функцию. */
export async function deleteReview(id: number): Promise<string | null> {
  const { error } = await createClient().rpc("admin_delete_review", { p_review_id: id });
  return error ? error.message : null;
}
