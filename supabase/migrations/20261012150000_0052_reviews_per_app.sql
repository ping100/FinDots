-- Отзывы — отдельно по каждому приложению Dots: на «Деньги», «Задачи» и
-- FemDots можно оставить по своему отзыву, и в админке они разложены по
-- приложениям. Старые отзывы (до разделения) — с app = null.
alter table public.reviews add column app text check (app in ('money', 'tasks', 'fem'));
alter table public.reviews drop constraint reviews_user_id_key;
alter table public.reviews add constraint reviews_user_app_key unique nulls not distinct (user_id, app);

-- Удалить свой отзыв о конкретном приложении (reviews неизменяема напрямую).
create function public.delete_own_app_review(p_app text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.reviews where user_id = auth.uid() and app is not distinct from p_app;
end;
$$;
revoke all on function public.delete_own_app_review(text) from public, anon;
grant execute on function public.delete_own_app_review(text) to authenticated;
