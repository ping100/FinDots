-- Исправление 0027: banned_until = 'infinity' ломает вход не тем сообщением.
--
-- 'infinity' — спецзначение самого Postgres для timestamptz, но GoTrue
-- (сервис авторизации Supabase, написан на Go) читает эту колонку в
-- обычный time.Time, у которого такого значения нет. При попытке войти
-- под заблокированным аккаунтом GoTrue падает на самом чтении строки и
-- отвечает общей «Database error querying schema» — вместо ожидаемого
-- «пользователь заблокирован». Снаружи выглядит как поломка входа
-- вообще, а не как результат блокировки.
--
-- Дата в далёком будущем ведёт себя для goTrue так же, как обычная
-- timestamptz, и AT THE SAME TIME остаётся «навсегда» для человека.

create or replace function public.admin_set_banned(p_user_id uuid, p_banned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Нельзя заблокировать себя';
  end if;

  update auth.users
     set banned_until = case when p_banned then timestamptz '2099-12-31 23:59:59+00' else null end
   where id = p_user_id;
end;
$$;

-- Пользователей, уже заблокированных прежней версией функции (с
-- 'infinity'), переводим на то же далёкое, но валидное для GoTrue значение
-- — блокировка остаётся в силе, просто с рабочей датой вместо спецзначения.
update auth.users
   set banned_until = timestamptz '2099-12-31 23:59:59+00'
 where banned_until = 'infinity'::timestamptz;
