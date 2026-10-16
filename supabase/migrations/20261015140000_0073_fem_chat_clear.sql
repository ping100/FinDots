-- «Очистить переписку» во «Вместе». Строки не удаляются: текст стирается,
-- строка помечается cleared_at и пропадает из выборки у обоих
-- (ограничивающая политика RLS поверх «fem signals: mine»).
-- Ожидающие отметки близости тоже снимаются, чтобы не висели без сообщения.
alter table public.fem_signals add column if not exists cleared_at timestamptz;

create policy "fem signals: not cleared" on public.fem_signals as restrictive for select
  using (cleared_at is null);

create or replace function public.fem_chat_clear() returns integer language plpgsql security definer set search_path to '' as $$
declare v_pair uuid; v_count integer;
begin
  if auth.uid() is null then raise exception 'Нет входа' using errcode = '42501'; end if;
  v_pair := public.fem_pair_of(auth.uid());
  if v_pair is null then raise exception 'Партнёр не подключён'; end if;
  update public.fem_signals set item = null, reply_to = null, cleared_at = now()
   where cleared_at is null
     and ((from_id = auth.uid() and to_id = v_pair) or (from_id = v_pair and to_id = auth.uid()));
  get diagnostics v_count = row_count;
  update public.fem_intimacy set active = false, pending = false where pending and owner_id in (auth.uid(), v_pair);
  return v_count;
end; $$;
revoke all on function public.fem_chat_clear() from public, anon;
grant execute on function public.fem_chat_clear() to authenticated;
