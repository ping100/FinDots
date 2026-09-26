-- Пользователь удаляет свой отзыв сам — тем же принципом, что
-- delete_own_account: без параметров, всегда только свой auth.uid().
--
-- reviews нарочно неизменяема для всех (revoke update, delete, truncate
-- from authenticated в 0031) — удалить его самому напрямую нельзя,
-- только через SECURITY DEFINER функцию, как и админское удаление.

create or replace function public.delete_own_review()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.reviews where user_id = auth.uid();
end;
$$;

revoke all on function public.delete_own_review() from public, anon;
grant execute on function public.delete_own_review() to authenticated;
