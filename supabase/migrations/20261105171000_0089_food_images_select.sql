-- Перезапись картинки (upsert) в хранилище требует ещё и права на чтение.
create policy "food images: admin read"
on storage.objects for select to authenticated
using (bucket_id = 'food-images' and (select public.is_admin()));
