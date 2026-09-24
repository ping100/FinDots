-- Функция нужна только триггеру on_auth_user_created_todots, а не как
-- публичный RPC-эндпоинт — по умолчанию Postgres выдаёт EXECUTE на PUBLIC,
-- и Supabase-линтер справедливо помечает такую функцию как вызываемую
-- анонимно через /rest/v1/rpc/handle_new_todots_user.
revoke execute on function public.handle_new_todots_user() from public, anon, authenticated;
