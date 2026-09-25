-- Категории задач возвращаются: были в самой первой версии Todots, потом
-- убрали как «стикер без функции» (можно завести и приклеить, но без
-- фильтра и группировки). Раз просят вернуть — восстанавливаем как было,
-- плюс в списке дня теперь можно ещё и фильтровать по категории.

create table public.task_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  icon       text not null default 'circle',
  color      text not null default '#64748b',
  sort_order integer not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create index task_categories_user_idx on public.task_categories (user_id, archived, sort_order);

alter table public.task_categories enable row level security;
revoke all on public.task_categories from anon;
revoke truncate on public.task_categories from authenticated;
grant select, insert, update, delete on public.task_categories to authenticated;

create policy "own task categories" on public.task_categories
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Задача ссылается на категорию необязательно; убрали категорию — задача
-- не теряется, просто становится без категории (как и было устроено раньше).
alter table public.tasks
  add column category_id uuid references public.task_categories (id) on delete set null;

create index tasks_category_fk_idx on public.tasks (category_id);
