-- Нейросеть: авторежим — приложение само выбирает бесплатные модели под
-- задачу (текст / фото) и переключается, если модель занята.
alter table public.app_ai_config add column if not exists auto boolean not null default false;

create or replace function public.ai_config_full()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not coalesce((select p.access_ai from public.profiles p where p.id = auth.uid()), true) then
    raise exception 'ИИ отключён администратором' using errcode = '42501';
  end if;
  return (select jsonb_build_object('api_key_enc', c.api_key_enc, 'model', c.model, 'vision_model', c.vision_model, 'auto', c.auto)
            from public.app_ai_config c where c.id = true);
end;
$$;
revoke all on function public.ai_config_full() from public, anon;
grant execute on function public.ai_config_full() to authenticated;

create or replace function public.admin_ai_auto()
returns boolean
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return coalesce((select c.auto from public.app_ai_config c where c.id = true), false);
end;
$$;
revoke all on function public.admin_ai_auto() from public, anon;
grant execute on function public.admin_ai_auto() to authenticated;

create or replace function public.admin_set_ai_auto(p_auto boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  update public.app_ai_config set auto = coalesce(p_auto, false), updated_at = now() where id = true;
  perform public.admin_log_add(case when p_auto then 'Нейросеть: авто включено' else 'Нейросеть: авто выключено' end, null, null);
end;
$$;
revoke all on function public.admin_set_ai_auto(boolean) from public, anon;
grant execute on function public.admin_set_ai_auto(boolean) to authenticated;
