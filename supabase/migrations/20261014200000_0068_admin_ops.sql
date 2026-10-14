-- Админка как рабочий инструмент: уведомления админу о важном, утренняя
-- сводка, состояние фоновых задач, диагностика клиента, удержание, путь
-- новичка, использование функций, режим «технические работы».
--
-- Пуши админу шлёт сервер приложения (/api/admin-alert): у базы нет ключей
-- пушей. База лишь зовёт его через pg_net с тем же секретом, что и для
-- напоминаний (reminders_secret в Vault, REMINDERS_SECRET в Vercel).

-- ───────────────────────── уведомления админу ─────────────────────────
alter table public.admins add column if not exists alerts boolean not null default true;

-- Когда какой вид уведомления уходил последний раз: шторм ошибок — один пуш.
create table if not exists public.admin_alert_state (
  key     text primary key,
  sent_at timestamptz not null
);
alter table public.admin_alert_state enable row level security;
revoke all on public.admin_alert_state from anon, authenticated;

create or replace function public.admin_alert(
  p_key text, p_title text, p_body text, p_url text default '/admin', p_every interval default interval '10 minutes'
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if exists (select 1 from public.admin_alert_state s where s.key = p_key and s.sent_at > now() - p_every) then
    return;
  end if;
  insert into public.admin_alert_state (key, sent_at) values (p_key, now())
  on conflict (key) do update set sent_at = excluded.sent_at;
  perform net.http_post(
    url := 'https://dotsapp.vercel.app/api/admin-alert',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-reminders-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret')
    ),
    body := jsonb_build_object('title', p_title, 'body', p_body, 'url', p_url, 'tag', split_part(p_key, ':', 1)),
    timeout_milliseconds := 10000
  );
end;
$$;
-- Звать её могут только наши же функции и триггеры — не люди.
revoke execute on function public.admin_alert(text, text, text, text, interval) from public, anon, authenticated;

-- Устройства админов, включивших уведомления, — для /api/admin-alert.
create or replace function public.admin_alert_targets(p_secret text)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret') then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return query
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.admins a on a.user_id = s.user_id
  where a.alerts;
end;
$$;
revoke execute on function public.admin_alert_targets(text) from public;
grant execute on function public.admin_alert_targets(text) to anon, authenticated;

create or replace function public.admin_set_alerts(p_on boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.admins set alerts = p_on where user_id = auth.uid();
end;
$$;

create or replace function public.admin_my_alerts()
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select a.alerts from public.admins a where a.user_id = auth.uid();
$$;

-- Новое обращение.
create or replace function public.notify_admin_support()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  who text;
begin
  if new.from_admin then
    return new;
  end if;
  select coalesce(nullif(p.display_name, ''), u.email) into who
  from auth.users u left join public.profiles p on p.id = u.id where u.id = new.user_id;
  perform public.admin_alert(
    'support:' || new.user_id, '💬 Обращение: ' || coalesce(who, 'без имени'),
    coalesce(nullif(left(new.body, 140), ''), '📎 вложение'), '/admin/support', interval '2 minutes'
  );
  return new;
end;
$$;
create or replace trigger support_message_notify_admin
  after insert on public.support_messages
  for each row execute function public.notify_admin_support();

-- Низкая оценка.
create or replace function public.notify_admin_review()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.rating <= 2 then
    perform public.admin_alert(
      'review:' || new.id,
      '⭐ Оценка ' || new.rating || '★ — ' || case new.app when 'money' then 'Findots' when 'tasks' then 'Todots' when 'fem' then 'FemDots' else coalesce(new.app, '') end,
      coalesce(nullif(left(new.body, 140), ''), 'Без текста'), '/admin/reviews', interval '1 minute'
    );
  end if;
  return new;
end;
$$;
create or replace trigger review_notify_admin
  after insert on public.reviews
  for each row execute function public.notify_admin_review();

-- Журнал ошибок: о новой ошибке (такой ещё не было или её отметили
-- исправленной) — уведомление, не чаще раза в 10 минут.
create or replace function public.log_client_error(
  p_app text, p_path text, p_message text, p_stack text, p_build text, p_ua text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  msg text := left(coalesce(p_message, ''), 500);
  fp  text;
  fresh boolean;
begin
  if msg = '' then
    return;
  end if;
  if (select count(*) from public.app_errors e
      where e.created_at > now() - interval '1 hour'
        and e.user_id is not distinct from auth.uid()) >= 30 then
    return;
  end if;
  fp := md5(coalesce(left(p_app, 20), '') || '|' || regexp_replace(msg, '\d+', 'N', 'g'));
  fresh := not exists (select 1 from public.app_errors e where e.fingerprint = fp and e.resolved_at is null);
  insert into public.app_errors (user_id, app, path, message, stack, build, ua, fingerprint)
  values (auth.uid(), left(p_app, 20), left(p_path, 200), msg, left(p_stack, 4000),
          left(p_build, 40), left(p_ua, 300), fp);
  if fresh then
    perform public.admin_alert('errors', '🐞 Новая ошибка у пользователя', left(msg, 160), '/admin/errors');
  end if;
end;
$$;
grant execute on function public.log_client_error(text, text, text, text, text, text) to anon, authenticated;

-- ───────────────────────── сторож и утренняя сводка ─────────────────────────
-- Каждый час: упавшие фоновые задачи, ошибки сервера на фоновых вызовах,
-- переполнение базы.
create or replace function public.admin_watch()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  failed int;
  bad_http int;
  db_share numeric;
begin
  select count(*) into failed from cron.job_run_details d
  where d.status = 'failed' and d.start_time > now() - interval '1 hour';
  if failed > 0 then
    perform public.admin_alert('cron', '⚙️ Фоновые задачи падают',
      failed || ' сбоев за час — напоминания могут не приходить', '/admin/jobs', interval '6 hours');
  end if;

  select count(*) into bad_http from net._http_response r
  where r.created > now() - interval '1 hour' and (r.status_code >= 500 or r.timed_out);
  if bad_http >= 3 then
    perform public.admin_alert('http', '⚙️ Сервер не отвечает на фоновые вызовы',
      bad_http || ' ошибок за час — проверьте сайт', '/admin/jobs', interval '6 hours');
  end if;

  db_share := pg_catalog.pg_database_size(current_database()) / (500.0 * 1024 * 1024);
  if db_share >= 0.8 then
    perform public.admin_alert('db', '💾 База заполнена на ' || round(db_share * 100) || '%',
      'Бесплатный лимит — 500 МБ. Пора чистить или переходить на платный тариф', '/admin', interval '1 day');
  end if;
end;
$$;
revoke execute on function public.admin_watch() from public, anon, authenticated;

-- 9:00 по Алматы: как прошёл вчерашний день.
create or replace function public.admin_daily()
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  y date := (now() at time zone 'Asia/Almaty')::date - 1;
  active int;
  newbies int;
  errors int;
  unread int;
  fails int;
  db_pct int;
begin
  select count(*) into active from public.activity_days a where a.day = y;
  select count(*) into newbies from auth.users u
    where u.deleted_at is null and (u.created_at at time zone 'Asia/Almaty')::date = y;
  select count(distinct e.fingerprint) into errors from public.app_errors e
    where e.resolved_at is null and (e.created_at at time zone 'Asia/Almaty')::date = y;
  select count(*) into unread from public.support_messages m where not m.from_admin and m.read_at is null;
  select count(*) into fails from cron.job_run_details d
    where d.status = 'failed' and d.start_time > now() - interval '1 day';
  db_pct := round(pg_catalog.pg_database_size(current_database()) * 100.0 / (500 * 1024 * 1024));
  perform public.admin_alert(
    'daily', '☀️ Dots за вчера',
    'Заходили ' || active || ' · новых ' || newbies || ' · ошибок ' || errors ||
    ' · обращений ждут ' || unread ||
    case when fails > 0 then ' · сбоев задач ' || fails else '' end ||
    ' · база ' || db_pct || '%',
    '/admin', interval '20 hours'
  );
end;
$$;
revoke execute on function public.admin_daily() from public, anon, authenticated;

select cron.schedule('admin-watch', '7 * * * *', 'select public.admin_watch()');
select cron.schedule('admin-daily', '0 4 * * *', 'select public.admin_daily()');

-- ───────────────────────── состояние фоновых задач ─────────────────────────
create or replace function public.admin_cron_status()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', j.jobname,
        'schedule', j.schedule,
        'active', j.active,
        'last_start', l.start_time,
        'last_status', l.status,
        'last_message', left(l.return_message, 300),
        'runs_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '1 day'),
        'fails_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '1 day' and d.status = 'failed')
      ) order by j.jobid)
      from cron.job j
      left join lateral (
        select d.start_time, d.status, d.return_message from cron.job_run_details d
        where d.jobid = j.jobid order by d.start_time desc limit 1
      ) l on true
    ), '[]'::jsonb),
    'http_total_24h', (select count(*) from net._http_response r where r.created > now() - interval '1 day'),
    'http_bad_24h', (select count(*) from net._http_response r
                     where r.created > now() - interval '1 day' and (r.status_code >= 400 or r.timed_out or r.error_msg is not null)),
    'http_last_bad', (select jsonb_build_object('at', r.created, 'status', r.status_code,
                        'text', left(coalesce(r.error_msg, r.content), 300))
                      from net._http_response r
                      where r.status_code >= 400 or r.timed_out or r.error_msg is not null
                      order by r.created desc limit 1)
  );
end;
$$;

-- ───────────────────────── диагностика клиента ─────────────────────────
alter table public.presence add column if not exists build text;
alter table public.presence add column if not exists ua text;
alter table public.presence add column if not exists standalone boolean;
alter table public.presence add column if not exists client_at timestamptz;

-- Раз за открытие приложения: какая версия, браузер, установлено ли как
-- приложение. Нужно, чтобы ответить на «у меня не работает» за минуту.
create or replace function public.report_client(p_build text, p_ua text, p_standalone boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.presence (user_id, seen_at, build, ua, standalone, client_at)
  values (auth.uid(), now(), left(p_build, 40), left(p_ua, 300), p_standalone, now())
  on conflict (user_id) do update
    set build = excluded.build, ua = excluded.ua, standalone = excluded.standalone, client_at = excluded.client_at;
end;
$$;

create or replace function public.admin_user_diag(p_user_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'build', (select pr.build from public.presence pr where pr.user_id = p_user_id),
    'ua', (select pr.ua from public.presence pr where pr.user_id = p_user_id),
    'standalone', (select pr.standalone from public.presence pr where pr.user_id = p_user_id),
    'client_at', (select pr.client_at from public.presence pr where pr.user_id = p_user_id),
    'time_zone', (select p.time_zone from public.profiles p where p.id = p_user_id),
    'days', coalesce((select jsonb_agg(a.day order by a.day) from public.activity_days a
                      where a.user_id = p_user_id and a.day > current_date - 14), '[]'::jsonb),
    'errors', coalesce((select jsonb_agg(e order by e.created_at desc) from (
                select e.message, e.path, e.created_at, e.build from public.app_errors e
                where e.user_id = p_user_id order by e.created_at desc limit 5) e), '[]'::jsonb)
  );
end;
$$;

-- ───────────────────────── удержание ─────────────────────────
-- Новички по неделям регистрации: сколько вернулось на следующий день,
-- через неделю (7–13 день) и через месяц (28–34 день).
create or replace function public.admin_retention()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
declare
  today date := (now() at time zone 'Asia/Almaty')::date;
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(c order by c.week desc)
    from (
      select
        date_trunc('week', u.d)::date as week,
        count(*) as size,
        count(*) filter (where u.d + 1 <= today) as d1_base,
        count(*) filter (where exists (select 1 from public.activity_days a where a.user_id = u.id and a.day = u.d + 1)) as d1,
        count(*) filter (where u.d + 13 <= today) as d7_base,
        count(*) filter (where exists (select 1 from public.activity_days a where a.user_id = u.id and a.day between u.d + 7 and u.d + 13)) as d7,
        count(*) filter (where u.d + 34 <= today) as d30_base,
        count(*) filter (where exists (select 1 from public.activity_days a where a.user_id = u.id and a.day between u.d + 28 and u.d + 34)) as d30
      from (
        select au.id, (au.created_at at time zone 'Asia/Almaty')::date as d
        from auth.users au
        where au.deleted_at is null and au.created_at > now() - interval '70 days'
      ) u
      group by 1
    ) c
  ), '[]'::jsonb);
end;
$$;

-- ───────────────────────── путь новичка ─────────────────────────
create or replace function public.admin_funnel(p_days int default 90)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'registered', count(*),
      'money', count(*) filter (where u.money),
      'tasks', count(*) filter (where u.tasks),
      'fem', count(*) filter (where u.fem),
      'first_record', count(*) filter (where u.money or u.tasks or u.fem),
      'came_back', count(*) filter (where exists (select 1 from public.activity_days a where a.user_id = u.id and a.day > u.d)),
      'two_weeks', count(*) filter (where exists (select 1 from public.activity_days a where a.user_id = u.id and a.day >= u.d + 14)),
      'two_weeks_base', count(*) filter (where u.d + 14 <= (now() at time zone 'Asia/Almaty')::date)
    )
    from (
      select au.id, (au.created_at at time zone 'Asia/Almaty')::date as d,
        exists (select 1 from public.transactions t where t.user_id = au.id) as money,
        exists (select 1 from public.tasks k where k.user_id = au.id) as tasks,
        (exists (select 1 from public.fem_periods f where f.user_id = au.id)
          or exists (select 1 from public.fem_days f where f.user_id = au.id)) as fem
      from auth.users au
      where au.deleted_at is null and au.created_at > now() - make_interval(days => p_days)
    ) u
  );
end;
$$;

-- ───────────────────────── использование функций ─────────────────────────
-- Только сколько людей пользуется — ни сумм, ни текстов, ни данных о здоровье.
create or replace function public.admin_features()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'money_users', (select count(distinct user_id) from public.transactions),
    'tasks_users', (select count(distinct user_id) from public.tasks),
    'fem_users', (select count(distinct x.user_id) from (
                    select user_id from public.fem_settings where consent_at is not null
                    union select user_id from public.fem_periods) x),
    'all_users', (select count(*) from auth.users where deleted_at is null),
    'money', jsonb_build_object(
      'savings',   (select count(distinct user_id) from public.wallets where kind = 'savings' and not archived),
      'debts',     (select count(distinct user_id) from public.wallets where kind in ('debt_out', 'debt_in') and not archived),
      'currency',  (select count(distinct w.user_id) from public.wallets w join public.profiles p on p.id = w.user_id
                    where not w.archived and w.currency is distinct from p.base_currency),
      'limits',    (select count(distinct user_id) from public.categories where monthly_limit is not null and not archived),
      'bills',     (select count(distinct user_id) from public.categories where planned_amount is not null and not archived),
      'subcats',   (select count(distinct user_id) from public.categories where parent_id is not null and not archived),
      'fees',      (select count(distinct user_id) from public.transactions where type = 'expense' and parent_id is not null),
      'ai',        (select count(distinct user_id) from public.ai_usage),
      'auto_rates',(select count(*) from public.profiles where rates_auto is not false
                      and id in (select distinct user_id from public.transactions))
    ),
    'tasks', jsonb_build_object(
      'repeat',    (select count(distinct user_id) from public.tasks where repeat is not null),
      'checklist', (select count(distinct user_id) from public.tasks where jsonb_array_length(coalesce(checklist, '[]'::jsonb)) > 0),
      'remind',    (select count(distinct user_id) from public.tasks where remind),
      'time',      (select count(distinct user_id) from public.tasks where time is not null),
      'notes',     (select count(distinct user_id) from public.tasks where coalesce(note, '') <> ''),
      'water',     (select count(*) from public.wellness_settings where water_on),
      'sleep',     (select count(*) from public.wellness_settings where sleep_on),
      'summary',   (select count(*) from public.wellness_settings where summary_on)
    ),
    'fem', jsonb_build_object(
      'partner',   (select count(distinct owner_id) from public.fem_shares where accepted_at is not null and active),
      'reminders', (select count(*) from public.fem_settings where consent_at is not null and (remind_period or remind_fertile)),
      'pill',      (select count(*) from public.fem_settings where pill_on)
    ),
    'common', jsonb_build_object(
      'dark',      (select count(*) from public.profiles where theme = 'dark'),
      'big_text',  (select count(*) from public.profiles where text_scale in ('large', 'xlarge')),
      'push',      (select count(distinct user_id) from public.push_subscriptions),
      'installed', (select count(*) from public.presence where standalone),
      'google',    (select count(distinct user_id) from auth.identities where provider = 'google')
    )
  );
end;
$$;

-- ───────────────────────── технические работы ─────────────────────────
-- Одна строка: текст полосы для всех. null — режим выключен.
create table if not exists public.app_notice (
  id         boolean primary key default true check (id),
  message    text,
  updated_at timestamptz not null default now()
);
insert into public.app_notice (id) values (true) on conflict do nothing;
alter table public.app_notice enable row level security;
revoke all on public.app_notice from anon, authenticated;

create or replace function public.app_notice()
returns text
language sql
stable security definer
set search_path to ''
as $$
  select n.message from public.app_notice n where n.id;
$$;
grant execute on function public.app_notice() to anon, authenticated;

create or replace function public.admin_set_notice(p_message text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  update public.app_notice set message = nullif(trim(coalesce(p_message, '')), ''), updated_at = now() where id;
  insert into public.admin_log (admin_id, action, details)
  values (auth.uid(),
    case when nullif(trim(coalesce(p_message, '')), '') is null then 'Технические работы выключены'
         else 'Технические работы включены' end,
    left(p_message, 200));
end;
$$;
