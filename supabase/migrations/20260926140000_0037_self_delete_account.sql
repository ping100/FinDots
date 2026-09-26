-- Пользователь удаляет свою учётную запись сам, с подтверждением на
-- клиенте (набрать слово, как у «Начать с чистого листа»).
--
-- auth.users обычному пользователю на запись недоступен — нужна
-- SECURITY DEFINER функция, но проверка здесь тривиальна: параметров
-- нет, всегда только свой auth.uid(), чужой аккаунт этим путём не
-- достать. Каскад по всем таблицам уже настроен (admin_delete_user
-- полагается на тот же on delete cascade), так что одно удаление
-- стирает всё: профиль, кошельки, операции, задачи, отзыв, переписку,
-- подписки на push.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
