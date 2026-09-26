-- Исправление 0032: default privileges схемы public дали authenticated
-- полный набор прав на новую таблицу (INSERT/UPDATE/DELETE/TRUNCATE), а
-- я снял их только у anon. RLS на таблице покрывает лишь SELECT (policy
-- "admin read"), так что запись формально и так блокировалась бы —
-- default-deny для команд без policy, — но полагаться на отсутствие
-- policy менее надёжно, чем явно снять права, как это уже сделано для
-- admins и presence.

revoke insert, update, delete, truncate on public.support_thread_state from authenticated;
