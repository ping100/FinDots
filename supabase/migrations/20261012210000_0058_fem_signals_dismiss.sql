-- Просьбы партнёра можно смахнуть или они уходят после ответа: отметка
-- dismissed_at, чтобы смахнутая не возвращалась после перезахода.
alter table public.fem_signals add column dismissed_at timestamptz;

create function public.fem_signals_dismiss(p_ids bigint[])
returns void
language sql security definer set search_path to ''
as $$
  update public.fem_signals set dismissed_at = now(), seen_at = coalesce(seen_at, now())
   where to_id = auth.uid() and id = any (p_ids) and dismissed_at is null;
$$;
revoke all on function public.fem_signals_dismiss(bigint[]) from public, anon;
grant execute on function public.fem_signals_dismiss(bigint[]) to authenticated;
