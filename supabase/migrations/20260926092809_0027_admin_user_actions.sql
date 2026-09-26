-- Админка: действия с пользователем — доступ по приложениям, блокировка
-- входа, сброс данных, удаление аккаунта.
--
-- Ни удаление, ни блокировка не требуют service_role: у роли postgres,
-- под которой выполняются миграции и SECURITY DEFINER функции, уже есть
-- права на запись в auth.users (это стандартно для проекта Supabase), и
-- удаление каскадом стирает вообще всё — на каждой таблице, ссылающейся
-- на auth.users, стоит on delete cascade.

-- ───────────── доступ к приложениям, отдельно на каждое ─────────────────
-- Значение читает сам пользователь — по нему макет решает, пускать ли на
-- /money или /tasks, — а меняет только админ. Поэтому запись в эти две
-- колонки отзываем у обычных пользователей: иначе заблокированный сам себе
-- открыл бы доступ обратно тем же запросом, что редактирует имя.

alter table public.profiles
  add column access_money boolean not null default true,
  add column access_tasks boolean not null default true;

revoke update (access_money, access_tasks) on public.profiles from authenticated;

create or replace function public.admin_set_access(p_user_id uuid, p_money boolean, p_tasks boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  update public.profiles set access_money = p_money, access_tasks = p_tasks where id = p_user_id;
end;
$$;

revoke all on function public.admin_set_access(uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_set_access(uuid, boolean, boolean) to authenticated;

-- ───────────────────────────── блокировка входа ─────────────────────────
-- banned_until — колонка самого GoTrue: дата в будущем запрещает вход,
-- null снимает запрет. Уже открытую сессию она не обрывает мгновенно —
-- до захода или обновления токена человек ещё внутри, — но новый вход
-- невозможен сразу.

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
     set banned_until = case when p_banned then 'infinity'::timestamptz else null end
   where id = p_user_id;
end;
$$;

revoke all on function public.admin_set_banned(uuid, boolean) from public, anon;
grant execute on function public.admin_set_banned(uuid, boolean) to authenticated;

-- ───────────────── очистить базу: деньги и задачи целиком ───────────────
-- Тот же список таблиц, что у самостоятельного «Начать с чистого листа»
-- (resetMoneyData) — плюс задачи и их категории: там это раздельные кнопки
-- по своим приложениям, здесь админ чистит разом оба. Аккаунт, вход и
-- настройки (валюта, тема, ключ ИИ) не трогаем — только данные.

create or replace function public.admin_wipe_user_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  delete from public.transactions    where user_id = p_user_id;
  delete from public.wallets         where user_id = p_user_id;
  delete from public.categories      where user_id = p_user_id;
  delete from public.tasks           where user_id = p_user_id;
  delete from public.task_categories where user_id = p_user_id;
end;
$$;

revoke all on function public.admin_wipe_user_data(uuid) from public, anon;
grant execute on function public.admin_wipe_user_data(uuid) to authenticated;

-- ──────────────────────────── удалить аккаунт ────────────────────────────
-- auth.users — корень всех связей: у profiles, wallets, categories,
-- transactions, tasks, task_categories, ai_keys, ai_usage,
-- push_subscriptions, presence, support_messages, user_numbers — on delete
-- cascade, поэтому одно удаление стирает всё и не оставляет сирот.

create or replace function public.admin_delete_user(p_user_id uuid)
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
    raise exception 'Нельзя удалить себя';
  end if;

  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ──────────────────── admin_overview: статусы для действий ──────────────

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
          exists (select 1 from public.ai_keys ak where ak.user_id = au.id) as has_ai_key,
          coalesce((select sum(g.calls) from public.ai_usage g where g.user_id = au.id), 0) as ai_calls,
          -- Новое: доступна ли учётная запись и до каких приложений.
          (au.banned_until is not null and au.banned_until > now()) as banned,
          coalesce(p.access_money, true) as access_money,
          coalesce(p.access_tasks, true) as access_tasks
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
