-- Админка Dots.
--
-- Кто админ, решает таблица admins. Политик на ней нет вовсе: через API её
-- не прочитать и не изменить никому, даже самим админам, — назначают
-- админа строкой в базе. Проверку «админ ли это» делает сама база внутри
-- функций, а не страница: найдя адрес /admin, посторонний не получит ничего.
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- Для ссылки в настройках: показывать её только тому, кому она откроется.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

-- Сводка для админки.
--
-- Сумм, названий операций и текстов задач здесь нет намеренно: на экране
-- входа людям обещано, что их данные видят только они. Владельцу хватает
-- счётчиков, чтобы понять, кто и насколько пользуется приложениями.
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
          au.email,
          p.display_name,
          au.created_at,
          -- «Был последний раз» — по самому свежему следу: вход, обновление
          -- сессии или запись. Одного last_sign_in_at мало: с долгой сессией
          -- человек неделями не входит заново, хотя пользуется каждый день.
          greatest(
            au.last_sign_in_at,
            (select max(s.refreshed_at) from auth.sessions s where s.user_id = au.id),
            (select max(t.created_at) from public.transactions t where t.user_id = au.id),
            (select max(k.created_at) from public.tasks k where k.user_id = au.id)
          ) as last_seen,
          coalesce((select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id = au.id), '[]'::jsonb) as providers,
          (select count(*) from public.wallets w where w.user_id = au.id and not w.archived) as wallets,
          (select count(*) from public.transactions t where t.user_id = au.id) as transactions,
          (select count(*) from public.tasks k where k.user_id = au.id and not k.done) as tasks_open,
          (select count(*) from public.tasks k where k.user_id = au.id and k.done) as tasks_done,
          exists (select 1 from public.ai_keys ak where ak.user_id = au.id) as has_ai_key,
          coalesce((select sum(g.calls) from public.ai_usage g where g.user_id = au.id), 0) as ai_calls
        from auth.users au
        left join public.profiles p on p.id = au.id
        where au.deleted_at is null
      ) u
    ), '[]'::jsonb),

    'totals', jsonb_build_object(
      'users',       (select count(*) from auth.users where deleted_at is null),
      'new_7d',      (select count(*) from auth.users where deleted_at is null and created_at > week_ago),
      'new_30d',     (select count(*) from auth.users where deleted_at is null and created_at > month_ago),
      -- Активные по правилам Supabase: вошёл или обновил сессию за 30 дней.
      -- Именно их считает лимит «Monthly Active Users».
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
          select c.relname, pg_catalog.pg_total_relation_size(c.oid) as bytes, c.reltuples::bigint as rows
          from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
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

revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_overview() to authenticated;
