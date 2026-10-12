import { createClient } from "@/lib/supabase/client";

/** Приложение Dots, о котором отзыв. */
export type ReviewApp = "money" | "tasks" | "fem";

export const REVIEW_APPS: { id: ReviewApp; label: string; icon: string; color: string }[] = [
  { id: "money", label: "Findots", icon: "wallet", color: "#22c55e" },
  { id: "tasks", label: "Todots", icon: "list", color: "#60a5fa" },
  { id: "fem", label: "FemDots", icon: "flower", color: "#ec4899" },
];

/** Один отзыв: оценка 1–5 и необязательный текст. app = null — оставлен до разделения по приложениям. */
export interface Review {
  id: number;
  user_id: string;
  app: ReviewApp | null;
  rating: number;
  body: string | null;
  created_at: string;
}

const COLUMNS = "id, user_id, app, rating, body, created_at";

export const REVIEW_MAX = 2000;

/** Отправить отзыв. Возвращает текст ошибки или null при успехе. */
export async function submitReview(app: ReviewApp, rating: number, body: string): Promise<string | null> {
  const text = body.trim();
  const { error } = await createClient()
    .from("reviews")
    .insert({ app, rating, body: text || null });
  return error ? error.message : null;
}

/** Свой отзыв об этом приложении, если уже оставлен (unique по user_id + app). */
export async function loadOwnReview(app: ReviewApp): Promise<Review | null> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return null;
  const { data } = await createClient()
    .from("reviews")
    .select(COLUMNS)
    .eq("user_id", user.id)
    .eq("app", app)
    .maybeSingle();
  return (data as Review | null) ?? null;
}

/** Все отзывы — RLS отдаёт их целиком только администратору. */
export async function loadReviews(): Promise<Review[]> {
  const { data } = await createClient()
    .from("reviews")
    .select(COLUMNS)
    .order("created_at", { ascending: false });
  return (data ?? []) as Review[];
}

/** Удалить отзыв (в админке). reviews неизменяема для всех — только через SECURITY DEFINER функцию. */
export async function deleteReview(id: number): Promise<string | null> {
  const { error } = await createClient().rpc("admin_delete_review", { p_review_id: id });
  return error ? error.message : null;
}

/** Удалить свой отзыв об этом приложении — сам человек, из настроек. */
export async function deleteOwnReview(app: ReviewApp): Promise<string | null> {
  const { error } = await createClient().rpc("delete_own_app_review", { p_app: app });
  return error ? error.message : null;
}
