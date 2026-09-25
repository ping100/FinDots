-- notify_admin_reply — только для триггера на вставку в support_messages,
-- а не отдельная ручка API. По умолчанию Postgres даёт EXECUTE всем при
-- создании функции — здесь это лишнее: вызванная напрямую (не из триггера),
-- она просто упадёт на ссылке на несуществующий NEW, но незачем и пытаться.
revoke execute on function public.notify_admin_reply() from public, anon, authenticated;
