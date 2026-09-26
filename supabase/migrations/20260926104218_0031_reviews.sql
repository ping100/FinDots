-- Отзывы из настроек: оценка 1–5 и необязательный текст.
--
-- Тем же принципом, что support_messages: строка своя при записи, у
-- чтения — своя или для админа любая. Отзыв не редактируется и не
-- удаляется — оставил, и он лёг в историю, а не превратился в переписку.

create table public.reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text check (body is null or char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index reviews_created_idx on public.reviews (created_at desc);

alter table public.reviews enable row level security;
revoke all on public.reviews from anon;
revoke update, delete, truncate on public.reviews from authenticated;
grant select, insert on public.reviews to authenticated;

create policy "own or admin read" on public.reviews
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "write own" on public.reviews
  for insert to authenticated
  with check (user_id = (select auth.uid()));
