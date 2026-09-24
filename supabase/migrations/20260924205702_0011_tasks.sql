-- Задачи Todots переезжают в общую базу: учётная запись одна на оба
-- приложения, значит и таблицы живут рядом. Столбцы взяты один в один из
-- прежней базы todots, чтобы перенести данные без переделки.
create table public.tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  title      text        not null,
  -- Дата и время необязательны: задача может быть просто «когда-нибудь».
  date       date,
  time       time,
  priority   text        not null default 'medium' check (priority in ('low', 'medium', 'high')),
  done       boolean     not null default false,
  -- Свой порядок внутри дня: перетаскиванием человек ставит важное выше.
  sort_order integer     not null default 0,
  note       text,
  remind     boolean     not null default false,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "Свои задачи" on public.tasks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Список всегда спрашивают за свой день или за ближайшие дни.
create index tasks_user_date_idx on public.tasks (user_id, date, sort_order);
