-- handle_new_user() нужна только триггеру на auth.users и выполняется от
-- владельца. Через PostgREST она торчала наружу как /rpc/handle_new_user,
-- поэтому право на вызов снимаем со всех ролей API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
