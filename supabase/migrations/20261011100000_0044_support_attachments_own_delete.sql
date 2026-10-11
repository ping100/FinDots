-- Человек может удалить фото своей переписки — нужно, чтобы при
-- самостоятельном удалении аккаунта не оставались его файлы.
create policy "support attachments: own delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'support-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
