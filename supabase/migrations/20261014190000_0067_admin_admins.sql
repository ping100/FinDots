-- Админы из админки: пометка «админ» в сводке и функция назначить/снять.
--
-- admin_set_admin содержит удаление строки, поэтому применяется вручную
-- в SQL Editor Supabase (инструмент базы не пропускает такие команды).

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
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
          -- Только «пользуется или нет» — ни дат, ни количества записей.
          (exists (select 1 from public.fem_settings f where f.user_id = au.id and f.consent_at is not null)
            or exists (select 1 from public.fem_periods f where f.user_id = au.id)) as fem,
          (exists (select 1 from public.wellness_settings w where w.user_id = au.id and (w.water_on or w.sleep_on))
            or exists (select 1 from public.water_log w where w.user_id = au.id)) as wellness,
          (select count(*) from public.push_subscriptions s where s.user_id = au.id) as push_devices,
          exists (select 1 from public.admins x where x.user_id = au.id) as is_admin,
          (au.banned_until is not null and au.banned_until > now()) as banned,
          coalesce(p.access_money, true) as access_money,
          coalesce(p.access_tasks, true) as access_tasks,
          coalesce(p.access_ai, true) as access_ai,
          coalesce(p.access_fem, true) as access_fem
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
      'fem_users',   (select count(distinct x.user_id) from (
                        select user_id from public.fem_settings where consent_at is not null
                        union select user_id from public.fem_periods) x),
      'wellness_users', (select count(distinct x.user_id) from (
                        select user_id from public.wellness_settings where water_on or sleep_on
                        union select user_id from public.water_log) x),
      'push_users',  (select count(distinct user_id) from public.push_subscriptions),
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
            -- Таблицы FemDots не показываем даже числом строк: данные о здоровье.
            and c.relname not like 'fem\_%'
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

create or replace function public.admin_set_admin(p_user_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  if not p_on and p_user_id = auth.uid() then
    raise exception 'Снять права с себя нельзя — попросите другого админа';
  end if;
  if p_on then
    insert into public.admins (user_id) values (p_user_id) on conflict do nothing;
  else
    delete from public.admins where user_id = p_user_id;
  end if;
  insert into public.admin_log (admin_id, action, target_id, target_label)
  values (
    auth.uid(), case when p_on then 'Назначен админом' else 'Сняты права админа' end, p_user_id,
    (select coalesce(nullif(p.display_name, ''), u.email) || coalesce(' · ID ' || un.number, '')
     from auth.users u
     left join public.profiles p on p.id = u.id
     left join public.user_numbers un on un.user_id = u.id
     where u.id = p_user_id)
  );
end;
$$;
