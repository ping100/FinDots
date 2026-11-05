-- Ключи фотостоков (Pixabay, Pexels) для поиска красивых картинок продуктов.
-- Как и ключ нейросети: шифруются на сервере, в базе только шифротекст.
-- Политик нет — только функции для админа.

create table if not exists public.app_photo_keys (
  provider text primary key check (provider in ('pixabay', 'pexels')),
  key_enc text,
  hint text check (char_length(hint) <= 12),
  updated_at timestamptz not null default now()
);
alter table public.app_photo_keys enable row level security;

create or replace function public.admin_photo_keys()
returns table (provider text, configured boolean, hint text, updated_at timestamptz)
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return query select k.provider, k.key_enc is not null, k.hint, k.updated_at from public.app_photo_keys k;
end;
$$;
revoke all on function public.admin_photo_keys() from public, anon;
grant execute on function public.admin_photo_keys() to authenticated;

-- Шифротексты — для серверного поиска картинок (вызывает его тоже админ).
create or replace function public.admin_photo_keys_full()
returns table (provider text, key_enc text)
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return query select k.provider, k.key_enc from public.app_photo_keys k where k.key_enc is not null;
end;
$$;
revoke all on function public.admin_photo_keys_full() from public, anon;
grant execute on function public.admin_photo_keys_full() to authenticated;

-- Поставить ключ (null — отключить).
create or replace function public.admin_photo_key_set(p_provider text, p_key_enc text, p_hint text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  insert into public.app_photo_keys (provider, key_enc, hint, updated_at)
  values (p_provider, p_key_enc, case when p_key_enc is null then null else p_hint end, now())
  on conflict (provider) do update
     set key_enc = excluded.key_enc, hint = excluded.hint, updated_at = now();
  perform public.admin_log_add(case when p_key_enc is null then 'Фотосток отключён' else 'Фотосток подключён' end, null, p_provider);
end;
$$;
revoke all on function public.admin_photo_key_set(text, text, text) from public, anon;
grant execute on function public.admin_photo_key_set(text, text, text) to authenticated;
