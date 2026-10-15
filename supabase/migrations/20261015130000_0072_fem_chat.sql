-- Чат пары во «Вместе»: обычные сообщения (kind = msg) рядом с просьбами и
-- ответами. Текст до 500 символов, сигналов в сутки — до 300: в переписке
-- 40 кончились бы за вечер.
alter table public.fem_signals drop constraint if exists fem_signals_kind_check;
alter table public.fem_signals add constraint fem_signals_kind_check
  check (kind in ('care', 'buy', 'alone', 'heart', 'ok', 'custom', 'reply', 'done', 'will', 'invite', 'intim', 'msg'));
alter table public.fem_signals drop constraint if exists fem_signals_item_check;
alter table public.fem_signals add constraint fem_signals_item_check check (char_length(item) <= 600);

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
  if p_kind not in ('care', 'buy', 'alone', 'heart', 'ok', 'custom', 'will', 'invite', 'msg') then
    raise exception 'Неизвестный сигнал';
  end if;
  if p_kind = 'msg' and coalesce(trim(p_item), '') = '' then raise exception 'Пустое сообщение'; end if;
  v_to := public.fem_pair_of(auth.uid());
  if v_to is null then raise exception 'Партнёр не подключён'; end if;
  if (select count(*) from public.fem_signals
       where from_id = auth.uid() and created_at > now() - interval '1 day') >= 300 then
    raise exception 'Слишком много за сутки — попробуйте завтра';
  end if;
  insert into public.fem_signals (from_id, to_id, kind, item)
  values (auth.uid(), v_to, p_kind, left(nullif(trim(p_item), ''), case when p_kind = 'msg' then 500 else 200 end));
end;
$$;

create or replace function public.fem_signal_reply(p_to bigint, p_kind text, p_item text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_from uuid;
begin
  if auth.uid() is null then raise exception 'Нет входа' using errcode = '42501'; end if;
  if p_kind not in ('reply', 'done') then raise exception 'Неверный ответ'; end if;
  select g.from_id into v_from from public.fem_signals g where g.id = p_to and g.to_id = auth.uid();
  if v_from is null then raise exception 'Нет такой просьбы'; end if;
  if public.fem_pair_of(auth.uid()) is distinct from v_from then raise exception 'Партнёр не подключён'; end if;
  if (select count(*) from public.fem_signals
       where from_id = auth.uid() and created_at > now() - interval '1 day') >= 300 then
    raise exception 'Слишком много за сутки — попробуйте завтра';
  end if;
  insert into public.fem_signals (from_id, to_id, kind, item, reply_to)
  values (auth.uid(), v_from, p_kind, left(nullif(trim(p_item), ''), 500), p_to);
  update public.fem_signals set seen_at = coalesce(seen_at, now()) where id = p_to;
end;
$$;
