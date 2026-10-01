-- Фото в переписке с администратором.
--
-- Приватный бакет: не public, читать может только автор переписки (сам
-- человек) или админ — тем же принципом, что и сама support_messages
-- ("own or admin read"). Путь файла — "{user_id переписки}/{имя}": у
-- админского сообщения это user_id адресата, не самого админа, так что
-- все файлы одного обращения лежат в одной папке независимо от того,
-- кто их прислал.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
);

create policy "support attachments: own or admin read"
on storage.objects for select to authenticated
using (
  bucket_id = 'support-attachments'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
);

create policy "support attachments: own or admin write"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'support-attachments'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
);

create policy "support attachments: admin delete"
on storage.objects for delete to authenticated
using (bucket_id = 'support-attachments' and (select public.is_admin()));

-- Сообщение может быть без текста, если это просто фото — но тогда
-- вложение обязательно, иначе получится пустая строка в переписке.
alter table public.support_messages alter column body drop not null;
alter table public.support_messages add column attachment_path text;
alter table public.support_messages drop constraint support_messages_body_check;
alter table public.support_messages add constraint support_messages_body_check check (
  (body is not null and char_length(btrim(body)) between 1 and 2000)
  or (body is null and attachment_path is not null)
);
