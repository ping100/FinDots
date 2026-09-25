-- Напоминания о задачах пушем.
--
-- Телефон подписывается на уведомления — подписка ложится сюда. Раз в
-- минуту база сама проверяет, не пора ли кому-то напомнить, и если пора —
-- зовёт сервер приложения, а он отправляет пуш через Apple или Google.
-- Время задачи — местное время человека, поэтому храним его часовой пояс.
--
-- Секрет reminders_secret кладётся в Vault отдельно, не этой миграцией:
-- репозиторий открытый, а тот же секрет лежит в Vercel (REMINDERS_SECRET).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Часовой пояс человека: его сообщает телефон при каждом открытии.
alter table public.profiles add column if not exists time_zone text;

-- Когда напоминание ушло — чтобы не прислать дважды.
alter table public.tasks add column if not exists reminded_at timestamptz;

-- Перенесли задачу на другое время или заново включили напоминание — оно
-- снова ждёт своего часа.
create or replace function public.tasks_reset_reminder()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.date is distinct from old.date
     or new.time is distinct from old.time
     or (new.remind and not old.remind) then
    new.reminded_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_reset_reminder
  before update on public.tasks
  for each row execute function public.tasks_reset_reminder();

-- Подписки телефонов. Одно устройство — одна подписка, и принадлежит она
-- тому, кто вошёл на нём последним.
create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;

create policy "own subscriptions" on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Записать подписку этого устройства за собой. Через функцию, а не прямой
-- записью: если на телефоне раньше был другой человек, подписка переходит
-- к вошедшему, а чужую строку правило доступа менять бы не дало.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Нужен вход' using errcode = '42501';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then
    raise exception 'Неверная подписка' using errcode = '22023';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- Отписать это устройство (выключил уведомления или вышел).
create or replace function public.forget_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
revoke execute on function public.forget_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.forget_push_subscription(text) to authenticated;

-- Отметка «я здесь» заодно сообщает часовой пояс телефона.
drop function if exists public.touch_presence();
create or replace function public.touch_presence(p_tz text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.presence (user_id, seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set seen_at = excluded.seen_at;
  if p_tz is not null and exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
    update public.profiles set time_zone = p_tz
    where id = auth.uid() and time_zone is distinct from p_tz;
  end if;
end;
$$;

revoke execute on function public.touch_presence(text) from public, anon;
grant execute on function public.touch_presence(text) to authenticated;

-- Какие напоминания пора отправить. Окно — 15 минут: если сервер был
-- недоступен, напомним с опозданием, но не пришлём пачку вчерашних.
create or replace function public.due_reminders()
returns table (task_id uuid, user_id uuid, title text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.user_id, t.title
  from public.tasks t
  join public.profiles p on p.id = t.user_id
  where t.remind and not t.done and t.time is not null and t.reminded_at is null
    and ((t.date + t.time) at time zone coalesce(p.time_zone, 'Asia/Almaty'))
        between now() - interval '15 minutes' and now()
    and exists (select 1 from public.push_subscriptions s where s.user_id = t.user_id);
$$;

revoke execute on function public.due_reminders() from public, anon, authenticated;

-- Забрать напоминания к отправке: отмечает их отправленными и отдаёт вместе
-- с подписками. Зовёт только сервер приложения, знающий секрет из Vault.
create or replace function public.claim_due_reminders(p_secret text)
returns table (endpoint text, p256dh text, auth text, title text, task_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret') then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return query
  with claimed as (
    update public.tasks t set reminded_at = now()
    from public.due_reminders() d
    where t.id = d.task_id and t.reminded_at is null
    returning t.id, t.user_id, t.title
  )
  select s.endpoint, s.p256dh, s.auth, c.title, c.id
  from claimed c
  join public.push_subscriptions s on s.user_id = c.user_id;
end;
$$;

-- Подписка умерла (приложение удалили, разрешение отозвали) — убрать.
create or replace function public.drop_push_subscription(p_secret text, p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret') then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

revoke execute on function public.claim_due_reminders(text) from public;
revoke execute on function public.drop_push_subscription(text, text) from public;
grant execute on function public.claim_due_reminders(text) to anon, authenticated;
grant execute on function public.drop_push_subscription(text, text) to anon, authenticated;

-- Раз в минуту: есть что отправить — зовём сервер. Нет — ничего не делаем,
-- и сервер лишний раз не просыпается.
create or replace function public.kick_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.due_reminders()) then
    perform net.http_post(
      url := 'https://dotsapp.vercel.app/api/reminders',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-reminders-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  end if;
end;
$$;

revoke execute on function public.kick_reminders() from public, anon, authenticated;

select cron.schedule('task-reminders', '* * * * *', $$select public.kick_reminders()$$);
