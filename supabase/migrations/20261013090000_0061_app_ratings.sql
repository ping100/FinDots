-- Средняя оценка каждого приложения для карточек на развилке. Сами отзывы
-- видны только автору и админу (RLS), поэтому наружу — лишь агрегат:
-- приложение, средняя и сколько оценок. Старые отзывы без app не входят.
create or replace function public.app_ratings()
returns table (app text, average numeric, total integer)
language sql
stable
security definer
set search_path = public
as $$
  select r.app, round(avg(r.rating)::numeric, 1), count(*)::int
  from public.reviews r
  where r.app is not null
  group by r.app;
$$;

revoke all on function public.app_ratings() from public, anon;
grant execute on function public.app_ratings() to authenticated;
