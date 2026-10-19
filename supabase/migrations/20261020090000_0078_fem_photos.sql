-- Одноразовые фото в чате пары («Вместе»).
--
-- Файл — в приватном бакете fem-photos по пути "{отправитель}/{uuid}.jpg".
-- Сигнал kind = 'photo', item = "путь|цвет,цвет,цвет,цвет" (4 основных
-- цвета — для красивой заглушки в ленте, само фото по ним не угадать).
--
-- Читать файл может только получатель и только пока не открыл
-- (dismissed_at is null) и не прошли сутки. Открыл — клиент скачивает,
-- удаляет файл через Storage API и зовёт fem_photo_opened: путь из item
-- стирается, остаются только цвета. Неоткрытые старше суток удаляет
-- отправитель при следующем входе в чат (свою папку он чистить может).
-- Админ доступа к бакету не имеет.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fem-photos', 'fem-photos', false, 4194304, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "fem photos: sender uploads to own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fem-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.fem_pair_of((select auth.uid())) is not null
);

create policy "fem photos: receiver reads once"
on storage.objects for select to authenticated
using (
  bucket_id = 'fem-photos'
  and exists (
    select 1 from public.fem_signals s
     where s.kind = 'photo' and s.to_id = (select auth.uid())
       and s.dismissed_at is null and s.created_at > now() - interval '1 day'
       and split_part(s.item, '|', 1) = name
  )
);

-- Отправитель видит свою папку (чтобы чистить), но не чужие.
create policy "fem photos: sender lists own"
on storage.objects for select to authenticated
using (bucket_id = 'fem-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "fem photos: sender or receiver deletes"
on storage.objects for delete to authenticated
using (
  bucket_id = 'fem-photos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.fem_signals s
       where s.kind = 'photo' and s.to_id = (select auth.uid()) and split_part(s.item, '|', 1) = name
    )
  )
);

alter table public.fem_signals drop constraint if exists fem_signals_kind_check;
alter table public.fem_signals add constraint fem_signals_kind_check
  check (kind in ('care', 'buy', 'alone', 'heart', 'ok', 'custom', 'reply', 'done', 'will', 'invite', 'intim', 'msg', 'photo'));

create or replace function public.fem_signal_send(p_kind text, p_item text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_to uuid;
begin
  if auth.uid() is null then raise exception 'Нет входа' using errcode = '42501'; end if;
  if p_kind not in ('care', 'buy', 'alone', 'heart', 'ok', 'custom', 'will', 'invite', 'msg', 'photo') then
    raise exception 'Неизвестный сигнал';
  end if;
  if p_kind = 'msg' and coalesce(trim(p_item), '') = '' then raise exception 'Пустое сообщение'; end if;
  -- Фото: только свой файл в своей папке.
  if p_kind = 'photo' and coalesce(p_item, '') !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(jpg|webp)\|[#0-9a-f,]{0,40}$') then
    raise exception 'Неверное фото';
  end if;
  v_to := public.fem_pair_of(auth.uid());
  if v_to is null then raise exception 'Партнёр не подключён'; end if;
  if (select count(*) from public.fem_signals
       where from_id = auth.uid() and created_at > now() - interval '1 day') >= 300 then
    raise exception 'Слишком много за сутки — попробуйте завтра';
  end if;
  insert into public.fem_signals (from_id, to_id, kind, item)
  values (auth.uid(), v_to, p_kind, left(nullif(trim(p_item), ''), case when p_kind = 'msg' then 500 else 200 end));
end;
$function$;

-- Получатель открыл фото: путь стирается, остаются цвета для заглушки.
create or replace function public.fem_photo_opened(p_id bigint)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.fem_signals
     set dismissed_at = coalesce(dismissed_at, now()), seen_at = coalesce(seen_at, now()),
         item = '|' || split_part(item, '|', 2)
   where id = p_id and kind = 'photo' and to_id = auth.uid();
$$;
revoke all on function public.fem_photo_opened(bigint) from public, anon;
grant execute on function public.fem_photo_opened(bigint) to authenticated;
