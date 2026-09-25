-- Имя из Google для тех, кто привязал Google уже после регистрации.
--
-- При регистрации через Google имя и так приходит (handle_new_user). А у
-- зарегистрированных по почте профиль получил начало почты — «wd-15», и
-- привязка Google его не меняла. Теперь меняет — но только такое
-- «имя-заглушку» или пустое: имя, которое человек выбрал сам, не трогаем.
create or replace function public.name_from_google()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  google_name text := nullif(btrim(coalesce(new.identity_data->>'name', new.identity_data->>'full_name')), '');
begin
  if new.provider = 'google' and google_name is not null then
    update public.profiles p
    set display_name = left(google_name, 40)
    from auth.users u
    where p.id = new.user_id and u.id = new.user_id
      and (p.display_name is null or btrim(p.display_name) = ''
           or p.display_name = split_part(u.email, '@', 1));
  end if;
  return new;
end;
$$;

revoke execute on function public.name_from_google() from public, anon, authenticated;

create trigger on_identity_name_from_google
  after insert on auth.identities
  for each row execute function public.name_from_google();

-- Уже привязавшим — то же самое, по тем же правилам.
update public.profiles p
set display_name = left(btrim(coalesce(i.identity_data->>'name', i.identity_data->>'full_name')), 40)
from auth.identities i
join auth.users u on u.id = i.user_id
where i.provider = 'google'
  and p.id = i.user_id
  and nullif(btrim(coalesce(i.identity_data->>'name', i.identity_data->>'full_name')), '') is not null
  and (p.display_name is null or btrim(p.display_name) = ''
       or p.display_name = split_part(u.email, '@', 1));
