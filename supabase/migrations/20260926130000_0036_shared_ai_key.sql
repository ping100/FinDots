-- ИИ-разбор бюджета переходит на общий ключ администратора.
--
-- Раньше каждый заводил свой OpenRouter-ключ и сам выбирал модель — это
-- усложняло вход в разбор и оставляло часть людей без него вовсе (ключ
-- завести не все готовы). Теперь ключ один (админский), модель одна на
-- всё приложение (выбирает админ), у каждого человека — простой
-- выключатель доступа, как у access_money/access_tasks.

-- ───────────────────────── доступ к ИИ-разбору ───────────────────────────

alter table public.profiles add column access_ai boolean not null default true;
-- Табличный UPDATE для authenticated уже снят (0028), колоночный список
-- в 0028 не трогаем — access_ai в него нарочно не входит: правит только
-- admin_set_access ниже.

-- ─────────────────── личный ключ и личная модель — долой ────────────────

drop view if exists public.ai_key_status;
drop table if exists public.ai_keys;
alter table public.profiles drop column ai_model;

-- ────────────────────────── общий конфиг ИИ ──────────────────────────────
-- Ключ лежит только зашифрованным: шифрует и расшифровывает исключительно
-- Node (AI_CONFIG_SECRET в переменных окружения Vercel, симметричный
-- AES-256-GCM) — в базе нет ни одной функции, которая отдавала бы открытый
-- текст ключа, так что подсмотреть его через консоль разработчика нельзя,
-- даже вызвав чужую RPC напрямую.

create table public.app_ai_config (
  id boolean primary key default true check (id),
  api_key_enc text,
  hint text,
  model text not null default 'google/gemma-4-31b-it:free',
  updated_at timestamptz not null default now()
);
insert into public.app_ai_config (id) values (true);

alter table public.app_ai_config enable row level security;
revoke all on public.app_ai_config from anon, authenticated;

-- Админ сохраняет конфиг; ключ приходит уже зашифрованным из Node-роута
-- (p_api_key_enc = null — заменяем только модель, ключ не трогаем).
create or replace function public.admin_set_ai_config(p_model text, p_api_key_enc text default null, p_hint text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  update public.app_ai_config
  set model = p_model,
      api_key_enc = coalesce(p_api_key_enc, api_key_enc),
      hint = coalesce(p_hint, hint),
      updated_at = now()
  where id = true;
end;
$$;

revoke all on function public.admin_set_ai_config(text, text, text) from public, anon;
grant execute on function public.admin_set_ai_config(text, text, text) to authenticated;

-- Админ смотрит статус — хвост ключа и модель, не сам ключ.
create or replace function public.admin_ai_config_status()
returns table(configured boolean, hint text, model text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  return query
    select c.api_key_enc is not null, c.hint, c.model, c.updated_at
    from public.app_ai_config c where c.id = true;
end;
$$;

revoke all on function public.admin_ai_config_status() from public, anon;
grant execute on function public.admin_ai_config_status() to authenticated;

-- /api/analyze читает шифротекст+модель этой функцией — только если у
-- самого вызывающего включён access_ai. Шифротекст отдавать не опасно:
-- без AI_CONFIG_SECRET (он есть только у Node) это бесполезный набор байт.
create or replace function public.ai_config_for_analysis()
returns table(api_key_enc text, model text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((select p.access_ai from public.profiles p where p.id = auth.uid()), true) then
    raise exception 'ИИ-разбор отключён администратором' using errcode = '42501';
  end if;

  return query select c.api_key_enc, c.model from public.app_ai_config c where c.id = true;
end;
$$;

revoke all on function public.ai_config_for_analysis() from public, anon;
grant execute on function public.ai_config_for_analysis() to authenticated;

-- ───────────── admin_set_access: третий переключатель — ИИ ──────────────

drop function if exists public.admin_set_access(uuid, boolean, boolean);

create function public.admin_set_access(p_user_id uuid, p_money boolean, p_tasks boolean, p_ai boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  update public.profiles set access_money = p_money, access_tasks = p_tasks, access_ai = p_ai where id = p_user_id;
end;
$$;

revoke all on function public.admin_set_access(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_set_access(uuid, boolean, boolean, boolean) to authenticated;

-- ───────────────── admin_overview: access_ai вместо has_ai_key ──────────

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  month_ago timestamptz := now() - interval '30 days';
  week_ago  timestamptz := now() - interval '7 days';
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),

    'users', coalesce((
      select jsonb_agg(row_to_json(u) order by u.created_at desc)
      from (
        select
          au.id,
          un.number,
          au.email,
          p.display_name,
          au.created_at,
          greatest(
            au.last_sign_in_at,
            pr.seen_at,
            (select max(s.refreshed_at) from auth.sessions s where s.user_id = au.id),
            (select max(t.created_at) from public.transactions t where t.user_id = au.id),
            (select max(k.created_at) from public.tasks k where k.user_id = au.id)
          ) as last_seen,
          pr.seen_at as online_at,
          coalesce((select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id = au.id), '[]'::jsonb) as providers,
          (select i.identity_data->>'email' from auth.identities i
            where i.user_id = au.id and i.provider = 'google'
            order by i.created_at limit 1) as google_email,
          (select coalesce(i.identity_data->>'avatar_url', i.identity_data->>'picture')
            from auth.identities i
            where i.user_id = au.id and i.provider = 'google'
            order by i.created_at limit 1) as avatar_url,
          (select count(*) from public.wallets w where w.user_id = au.id and not w.archived) as wallets,
          (select count(*) from public.transactions t where t.user_id = au.id) as transactions,
          (select count(*) from public.tasks k where k.user_id = au.id and not k.done) as tasks_open,
          (select count(*) from public.tasks k where k.user_id = au.id and k.done) as tasks_done,
          coalesce((select sum(g.calls) from public.ai_usage g where g.user_id = au.id), 0) as ai_calls,
          -- Новое: доступна ли учётная запись и до каких приложений.
          (au.banned_until is not null and au.banned_until > now()) as banned,
          coalesce(p.access_money, true) as access_money,
          coalesce(p.access_tasks, true) as access_tasks,
          coalesce(p.access_ai, true) as access_ai
        from auth.users au
        left join public.profiles p on p.id = au.id
        left join public.presence pr on pr.user_id = au.id
        left join public.user_numbers un on un.user_id = au.id
        where au.deleted_at is null
      ) u
    ), '[]'::jsonb),

    'totals', jsonb_build_object(
      'online',      (select count(*) from public.presence where seen_at > now() - interval '2 minutes'),
      'users',       (select count(*) from auth.users where deleted_at is null),
      'new_7d',      (select count(*) from auth.users where deleted_at is null and created_at > week_ago),
      'new_30d',     (select count(*) from auth.users where deleted_at is null and created_at > month_ago),
      'active_7d',   (select count(distinct x.id) from (
                        select id from auth.users where last_sign_in_at > week_ago
                        union select user_id from auth.sessions where refreshed_at > week_ago) x),
      'active_30d',  (select count(distinct x.id) from (
                        select id from auth.users where last_sign_in_at > month_ago
                        union select user_id from auth.sessions where refreshed_at > month_ago) x),
      'money_users', (select count(distinct user_id) from public.transactions),
      'tasks_users', (select count(distinct user_id) from public.tasks),
      'transactions',(select count(*) from public.transactions),
      'tasks',       (select count(*) from public.tasks)
    ),

    'database', jsonb_build_object(
      'size_bytes',  pg_catalog.pg_database_size(current_database()),
      'tables', coalesce((
        select jsonb_agg(jsonb_build_object('name', t.relname, 'bytes', t.bytes, 'rows', t.rows) order by t.bytes desc)
        from (
          select c.relname, pg_catalog.pg_total_relation_size(c.oid) as bytes,
                 coalesce(st.n_live_tup, 0) as rows
          from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          left join pg_catalog.pg_stat_user_tables st on st.relid = c.oid
          where n.nspname = 'public' and c.relkind = 'r'
        ) t
      ), '[]'::jsonb)
    ),

    'storage', jsonb_build_object(
      'size_bytes', coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects o), 0),
      'files',      (select count(*) from storage.objects)
    )
  );
end;
$$;
