-- Отправлять можно только «первые» сигналы. Ответы (reply, done) идут
-- через fem_signal_reply со ссылкой на просьбу, отметка близости (intim) —
-- через fem_partner_intimacy_set: иначе их можно было бы подделать.
create or replace function public.fem_signal_send(p_kind text, p_item text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_to uuid;
begin
  if auth.uid() is null then raise exception 'Нет входа' using errcode = '42501'; end if;
  if p_kind not in ('care', 'buy', 'alone', 'heart', 'ok', 'custom', 'will', 'invite') then
    raise exception 'Неизвестный сигнал';
  end if;
  v_to := public.fem_pair_of(auth.uid());
  if v_to is null then raise exception 'Партнёр не подключён'; end if;
  if (select count(*) from public.fem_signals
       where from_id = auth.uid() and created_at > now() - interval '1 day') >= 40 then
    raise exception 'Слишком много за сутки — попробуйте завтра';
  end if;
  insert into public.fem_signals (from_id, to_id, kind, item)
  values (auth.uid(), v_to, p_kind, left(nullif(trim(p_item), ''), 200));
end;
$$;
