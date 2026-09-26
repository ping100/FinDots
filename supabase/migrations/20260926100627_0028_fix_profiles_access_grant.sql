-- Исправление 0027: колоночный REVOKE не действует против табличного
-- GRANT. У authenticated по умолчанию (Supabase default privileges) был
-- табличный UPDATE на public.profiles — «revoke update (access_money,
-- access_tasks) ... from authenticated» в прошлой миграции ничего не
-- отозвал: табличное разрешение по-прежнему открывало запись в ЛЮБУЮ
-- колонку, включая эти две. Обычный пользователь мог тем же
-- update-запросом, что меняет имя, сам себе вернуть доступ.
--
-- Правильный способ — снять табличный грант целиком и выдать UPDATE
-- только на перечисленные колонки. Список — все прежние поля профиля,
-- без access_money и access_tasks: их по-прежнему может менять только
-- SECURITY DEFINER функция admin_set_access (владелец функции —
-- postgres, табличные и колоночные права роли authenticated её не
-- касаются).

revoke update on public.profiles from authenticated;

grant update (
  id, display_name, base_currency, theme, ai_model,
  created_at, text_scale, onboarding_seen, time_zone
) on public.profiles to authenticated;
