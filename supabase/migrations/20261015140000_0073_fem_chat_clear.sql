-- «Очистить переписку»: удаляет все сообщения пары — у обоих. Неподтверждённые
-- отметки близости, на которые больше нельзя ответить, снимаются.
create or replace function public.fem_chat_clear()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_pair uuid;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Нет входа' using errcode = '42501'; end if;
  v_pair := public.fem_pair_of(auth.uid());
  if v_pair is null then raise exception 'Партнёр не подключён'; end if;
  delete from public.fem_signals
   where (from_id = auth.uid() and to_id = v_pair) or (from_id = v_pair and to_id = auth.uid());
  get diagnostics v_count = row_count;
  update public.fem_intimacy set active = false, pending = false
   where pending and owner_id in (auth.uid(), v_pair);
  return v_count;
end;
$$;
revoke all on function public.fem_chat_clear() from public, anon;
grant execute on function public.fem_chat_clear() to authenticated;
