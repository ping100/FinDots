-- Обращения: скрыть переписку из списка и закрыть (удалить) её целиком.
--
-- Скрыть — это не флаг на переписке, а отметка времени: если после неё
-- пришло новое сообщение, переписка сама возвращается в список. Поэтому
-- отдельная таблица, а не колонка в support_messages — сама переписка
-- ничего не помнит про то, что её скрыли.

create table public.support_thread_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  hidden_at timestamptz
);

alter table public.support_thread_state enable row level security;
revoke all on public.support_thread_state from anon;
grant select on public.support_thread_state to authenticated;

create policy "admin read" on public.support_thread_state
  for select to authenticated
  using ((select public.is_admin()));

create or replace function public.admin_set_thread_hidden(p_user_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  if p_hidden then
    insert into public.support_thread_state (user_id, hidden_at)
    values (p_user_id, now())
    on conflict (user_id) do update set hidden_at = excluded.hidden_at;
  else
    delete from public.support_thread_state where user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.admin_set_thread_hidden(uuid, boolean) from public, anon;
grant execute on function public.admin_set_thread_hidden(uuid, boolean) to authenticated;

-- Удалить переписку целиком. С уведомлением — после удаления остаётся
-- одно новое сообщение от админа, что заодно будит тот же пуш, что и
-- обычный ответ (notify_admin_reply срабатывает на любую вставку с
-- from_admin = true, не только на ответ в существующей переписке).
create or replace function public.admin_close_thread(p_user_id uuid, p_notify boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;

  delete from public.support_messages where user_id = p_user_id;
  delete from public.support_thread_state where user_id = p_user_id;

  if p_notify then
    insert into public.support_messages (user_id, from_admin, body)
    values (p_user_id, true, 'Обращение закрыто. Если вопрос снова возникнет — напишите ещё раз.');
  end if;
end;
$$;

revoke all on function public.admin_close_thread(uuid, boolean) from public, anon;
grant execute on function public.admin_close_thread(uuid, boolean) to authenticated;
