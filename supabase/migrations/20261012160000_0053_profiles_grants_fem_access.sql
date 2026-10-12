-- 1. Исправление: apps_enabled (0050), rates_auto (0048) и shown_rates
--    (0049) добавлялись в profiles без колоночного UPDATE для
--    authenticated (табличный UPDATE снят в 0028), — шестерёнка на
--    развилке, «курс автоматически» и выбор курсов не сохранялись в базу.
grant update (apps_enabled, rates_auto, shown_rates) on public.profiles to authenticated;

-- 2. Доступ к FemDots админ закрывает так же, как к Findots и Todots.
--    Колонку пользователь сам не меняет — UPDATE на неё не выдаётся.
alter table public.profiles add column if not exists access_fem boolean not null default true;

-- Новая функция с доступом к FemDots. Старая admin_set_access (4 аргумента)
-- оставлена для открытых до обновления вкладок — FemDots она не трогает.
create or replace function public.admin_set_app_access(
  p_user_id uuid, p_money boolean, p_tasks boolean, p_ai boolean, p_fem boolean default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  update public.profiles
     set access_money = p_money, access_tasks = p_tasks, access_ai = p_ai,
         access_fem = coalesce(p_fem, access_fem)
   where id = p_user_id;
end;
$function$;
revoke all on function public.admin_set_app_access(uuid, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_set_app_access(uuid, boolean, boolean, boolean, boolean) to authenticated;

-- 3. Сводка админки: доступ к FemDots, пользуется ли человек FemDots
--    (только да/нет — данные о цикле админу не видны) и их число.
CREATE OR REPLACE FUNCTION public.admin_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
          (au.banned_until is not null and au.banned_until > now()) as banned,
          coalesce(p.access_money, true) as access_money,
          coalesce(p.access_tasks, true) as access_tasks,
          coalesce(p.access_ai, true) as access_ai,
          coalesce(p.access_fem, true) as access_fem,
          -- Пользуется ли FemDots — только да/нет, без данных о цикле.
          exists (select 1 from public.fem_settings f where f.user_id = au.id) as fem_on
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
      'fem_users',   (select count(*) from public.fem_settings),
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
$function$;
