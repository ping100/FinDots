-- Админка: задать пароль человеку самому, а не слать письмо со ссылкой.
--
-- encrypted_password в auth.users — обычный bcrypt-хеш (тот же формат,
-- что использует сам GoTrue при регистрации через почту). pgcrypto для
-- него уже установлен и живёт в схеме extensions — отсюда полные имена
-- функций при search_path = ''.

create or replace function public.admin_set_password(p_user_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  if char_length(p_password) < 6 then
    raise exception 'Пароль короче 6 символов';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;
end;
$$;

revoke all on function public.admin_set_password(uuid, text) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
