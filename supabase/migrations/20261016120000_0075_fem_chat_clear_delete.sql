-- «Очистить переписку» удаляет строки по-настоящему, без пометки cleared_at
-- (0073 обходил удаление только из-за подтверждений в MCP).
create or replace function public.fem_chat_clear() returns integer language plpgsql security definer set search_path to '' as $$
declare v_pair uuid; v_count integer;
begin
  if auth.uid() is null then raise exception 'Нет входа' using errcode = '42501'; end if;
  v_pair := public.fem_pair_of(auth.uid());
  if v_pair is null then raise exception 'Партнёр не подключён'; end if;
  delete from public.fem_signals
   where (from_id = auth.uid() and to_id = v_pair) or (from_id = v_pair and to_id = auth.uid());
  get diagnostics v_count = row_count;
  update public.fem_intimacy set active = false, pending = false where pending and owner_id in (auth.uid(), v_pair);
  return v_count;
end; $$;
revoke all on function public.fem_chat_clear() from public, anon;
grant execute on function public.fem_chat_clear() to authenticated;

delete from public.fem_signals where cleared_at is not null;
drop policy if exists "fem signals: not cleared" on public.fem_signals;
alter table public.fem_signals drop column if exists cleared_at;
