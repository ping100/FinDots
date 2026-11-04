-- Админка: модель для фото еды (Yumdots) — отдельно от модели разбора.
create or replace function public.admin_vision_model()
returns text
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return (select c.vision_model from public.app_ai_config c where c.id = true);
end;
$$;
revoke all on function public.admin_vision_model() from public, anon;
grant execute on function public.admin_vision_model() to authenticated;

create or replace function public.admin_set_vision_model(p_model text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  if coalesce(trim(p_model), '') = '' then
    raise exception 'Не указана модель';
  end if;
  update public.app_ai_config set vision_model = trim(p_model), updated_at = now() where id = true;
end;
$$;
revoke all on function public.admin_set_vision_model(text) from public, anon;
grant execute on function public.admin_set_vision_model(text) to authenticated;
