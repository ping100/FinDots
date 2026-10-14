-- Инструменты админки: журнал ошибок, активность по дням, журнал действий
-- администратора, рассылка всем. Все новые таблицы закрыты RLS без
-- политик (кроме чтения новостей) — работают только через функции ниже.

-- ───────────────────────────── журнал ошибок ─────────────────────────────
-- Приложение само присылает сюда сбои из браузера: упавший экран, ошибку
-- в коде. Админ видит их сгруппированными: что, сколько раз, у скольких
-- людей, в какой версии.
create table if not exists public.app_errors (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid references auth.users on delete set null,
  app         text,
  path        text,
  message     text not null,
  stack       text,
  build       text,
  ua          text,
  -- Одинаковые ошибки склеиваются: приложение + текст с цифрами, заменёнными на N.
  fingerprint text not null,
  resolved_at timestamptz
);
create index if not exists app_errors_fingerprint_idx on public.app_errors (fingerprint, created_at desc);
create index if not exists app_errors_recent_idx on public.app_errors (created_at desc);
alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon, authenticated;

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
begin
  if msg = '' then
    return;
  end if;
  -- Зацикленная ошибка не должна забить базу: не больше 30 записей в час
  -- с одного человека (все гости вместе — тоже 30).
  if (select count(*) from public.app_errors e
      where e.created_at > now() - interval '1 hour'
        and e.user_id is not distinct from auth.uid()) >= 30 then
    return;
  end if;
  insert into public.app_errors (user_id, app, path, message, stack, build, ua, fingerprint)
  values (
    auth.uid(), left(p_app, 20), left(p_path, 200), msg, left(p_stack, 4000),
    left(p_build, 40), left(p_ua, 300),
    md5(coalesce(left(p_app, 20), '') || '|' || regexp_replace(msg, '\d+', 'N', 'g'))
  );
end;
$$;
grant execute on function public.log_client_error(text, text, text, text, text, text) to anon, authenticated;

create or replace function public.admin_errors()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(g order by g.last_at desc)
    from (
      select
        e.fingerprint,
        (array_agg(e.app order by e.created_at desc))[1]     as app,
        (array_agg(e.message order by e.created_at desc))[1] as message,
        (array_agg(e.stack order by e.created_at desc))[1]   as stack,
        (array_agg(e.path order by e.created_at desc))[1]    as path,
        (array_agg(e.build order by e.created_at desc))[1]   as build,
        (array_agg(e.ua order by e.created_at desc))[1]      as ua,
        count(*)                                             as times,
        count(distinct e.user_id)                            as people,
        min(e.created_at)                                    as first_at,
        max(e.created_at)                                    as last_at
      from public.app_errors e
      where e.resolved_at is null and e.created_at > now() - interval '30 days'
      group by e.fingerprint
    ) g
  ), '[]'::jsonb);
end;
$$;

-- «Исправлено»: ошибка уходит из списка. Если повторится — вернётся.
create or replace function public.admin_resolve_error(p_fingerprint text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  update public.app_errors set resolved_at = now()
  where fingerprint = p_fingerprint and resolved_at is null;
end;
$$;

-- ───────────────────────────── активность по дням ─────────────────────────
-- Кто в какой день открывал приложение — одна строка на человека в день.
-- Пишет touch_presence (её зовёт каждое открытое приложение).
create table if not exists public.activity_days (
  user_id uuid not null references auth.users on delete cascade,
  day     date not null,
  primary key (user_id, day)
);
alter table public.activity_days enable row level security;
revoke all on public.activity_days from anon, authenticated;

-- Прошлый месяц восстанавливаем по записям: в дни, когда человек что-то
-- добавлял, он точно заходил.
insert into public.activity_days (user_id, day)
select distinct x.user_id, x.d
from (
  select t.user_id, (t.created_at at time zone 'Asia/Almaty')::date d from public.transactions t
  where t.created_at > now() - interval '31 days'
  union
  select k.user_id, (k.created_at at time zone 'Asia/Almaty')::date from public.tasks k
  where k.created_at > now() - interval '31 days'
  union
  select p.user_id, (p.seen_at at time zone 'Asia/Almaty')::date from public.presence p
  where p.seen_at > now() - interval '31 days'
) x
on conflict do nothing;

create or replace function public.touch_presence(p_tz text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  tz text := 'Asia/Almaty';
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.presence (user_id, seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set seen_at = excluded.seen_at;
  if p_tz is not null and exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
    tz := p_tz;
    update public.profiles set time_zone = p_tz
    where id = auth.uid() and time_zone is distinct from p_tz;
  end if;
  -- День — по часам самого человека.
  insert into public.activity_days (user_id, day)
  values (auth.uid(), (now() at time zone tz)::date)
  on conflict do nothing;
end;
$$;

-- 30 дней: сколько людей заходило и сколько зарегистрировалось.
create or replace function public.admin_activity()
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
    select jsonb_agg(jsonb_build_object(
      'day', d.day,
      'active', (select count(*) from public.activity_days a where a.day = d.day),
      'signups', (select count(*) from auth.users u
                  where u.deleted_at is null
                    and (u.created_at at time zone 'Asia/Almaty')::date = d.day)
    ) order by d.day)
    from (
      select g::date as day
      from generate_series((now() at time zone 'Asia/Almaty')::date - 29,
                           (now() at time zone 'Asia/Almaty')::date, interval '1 day') g
    ) d
  );
end;
$$;

-- ───────────────────────────── журнал действий ────────────────────────────
-- Кто из админов что сделал и с кем. Имя цели запоминается на момент
-- действия: после удаления аккаунта строка журнала остаётся понятной.
create table if not exists public.admin_log (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  admin_id     uuid references auth.users on delete set null,
  action       text not null,
  target_id    uuid,
  target_label text,
  details      text
);
create index if not exists admin_log_recent_idx on public.admin_log (created_at desc);
alter table public.admin_log enable row level security;
revoke all on public.admin_log from anon, authenticated;

create or replace function public.admin_log_add(p_action text, p_target uuid, p_details text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  insert into public.admin_log (admin_id, action, target_id, target_label, details)
  values (
    auth.uid(), left(p_action, 60), p_target,
    (select coalesce(nullif(p.display_name, ''), u.email)
            || coalesce(' · ID ' || un.number, '')
     from auth.users u
     left join public.profiles p on p.id = u.id
     left join public.user_numbers un on un.user_id = u.id
     where u.id = p_target),
    left(p_details, 500)
  );
end;
$$;

create or replace function public.admin_log_list()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(r order by r.created_at desc)
    from (
      select l.id, l.created_at, l.action, l.target_label, l.details,
             coalesce(nullif(p.display_name, ''), u.email) as admin_label
      from public.admin_log l
      left join auth.users u on u.id = l.admin_id
      left join public.profiles p on p.id = l.admin_id
      order by l.created_at desc
      limit 300
    ) r
  ), '[]'::jsonb);
end;
$$;

-- ───────────────────────────── рассылка ───────────────────────────────────
-- Объявление всем: показывается полосой внизу у каждого и уходит пушем.
create table if not exists public.announcements (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users on delete set null,
  title      text not null,
  body       text not null,
  url        text
);
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;
create policy "announcements read" on public.announcements for select to authenticated using (true);

create or replace function public.admin_announce(p_title text, p_body text, p_url text default null)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  new_id bigint;
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then
    raise exception 'Нужны заголовок и текст';
  end if;
  insert into public.announcements (created_by, title, body, url)
  values (auth.uid(), left(trim(p_title), 80), left(trim(p_body), 600), nullif(trim(coalesce(p_url, '')), ''))
  returning id into new_id;
  insert into public.admin_log (admin_id, action, details)
  values (auth.uid(), 'Рассылка', left(trim(p_title), 200));
  return new_id;
end;
$$;

create or replace function public.admin_announcements()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(r order by r.created_at desc)
    from (select id, created_at, title, body, url from public.announcements order by created_at desc limit 50) r
  ), '[]'::jsonb);
end;
$$;
