-- Удалить отзыв из админки.
--
-- reviews нарочно неизменяема для всех (revoke update, delete, truncate
-- from authenticated в 0031) — отзыв нельзя ни подделать задним числом,
-- ни стереть самому. Единственный ход — через администратора, отдельной
-- SECURITY DEFINER функцией, как и остальные admin_*.

create or replace function public.admin_delete_review(p_review_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  delete from public.reviews where id = p_review_id;
end;
$$;

revoke all on function public.admin_delete_review(bigint) from public, anon;
grant execute on function public.admin_delete_review(bigint) to authenticated;
