-- Правило загрузки фото звало fem_pair_of, а она закрыта для authenticated
-- (по ней можно узнать пару любого человека). Вместо неё — проверка только
-- для себя: «у меня есть пара».
create or replace function public.fem_has_pair()
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select public.fem_pair_of(auth.uid()) is not null;
$$;
revoke all on function public.fem_has_pair() from public, anon;
grant execute on function public.fem_has_pair() to authenticated;

alter policy "fem photos: sender uploads to own folder" on storage.objects
with check (
  bucket_id = 'fem-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.fem_has_pair())
);
