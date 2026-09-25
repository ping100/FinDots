-- Обращения к администратору: у каждого пользователя — своя переписка.
--
-- Одна таблица на всё: строка — одно сообщение, user_id — чья переписка,
-- from_admin — кто написал. Человек видит и пишет только в свою,
-- админ — во все. read_at ставит получатель, когда открыл переписку: по
-- нему считаются «новые» у обеих сторон.
create table public.support_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_admin boolean not null default false,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index support_messages_user_idx on public.support_messages (user_id, created_at);

alter table public.support_messages enable row level security;
revoke all on public.support_messages from anon;
revoke update, delete, truncate on public.support_messages from authenticated;
grant select, insert on public.support_messages to authenticated;

create policy "own or admin read" on public.support_messages
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Человек пишет только от себя и только в свою переписку; от имени админа
-- пишет только админ.
create policy "write as self or admin" on public.support_messages
  for insert to authenticated
  with check (
    (user_id = (select auth.uid()) and not from_admin)
    or (from_admin and (select public.is_admin()))
  );

-- Защита от засыпания админки сообщениями: не больше 20 в сутки от
-- одного человека. Админа не ограничиваем.
create or replace function public.support_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.from_admin and (
    select count(*) from public.support_messages m
    where m.user_id = new.user_id and not m.from_admin
      and m.created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'Слишком много сообщений за сутки — попробуйте завтра'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.support_rate_limit() from public, anon, authenticated;

create trigger support_rate_limit
  before insert on public.support_messages
  for each row execute function public.support_rate_limit();

-- Отметить переписку прочитанной. Правка строк напрямую закрыта: иначе
-- человек мог бы переписать чужой read_at или текст. Функция отмечает
-- только входящие — для человека ответы админа, для админа сообщения
-- человека.
create or replace function public.support_mark_read(p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is not null then
    if not public.is_admin() then
      raise exception 'Нет доступа' using errcode = '42501';
    end if;
    update public.support_messages set read_at = now()
    where user_id = p_user and not from_admin and read_at is null;
  else
    update public.support_messages set read_at = now()
    where user_id = auth.uid() and from_admin and read_at is null;
  end if;
end;
$$;

revoke execute on function public.support_mark_read(uuid) from public, anon;
grant execute on function public.support_mark_read(uuid) to authenticated;
