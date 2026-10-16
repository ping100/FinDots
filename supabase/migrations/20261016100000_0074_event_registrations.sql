-- Регистрация на мероприятия — отдельный сайт, не часть Dots.
--
-- Анкету заполняет кто угодно без входа, поэтому прямого доступа к таблицам
-- нет ни у anon, ни у authenticated: только функции ниже. Список анкет
-- (ФИО, телефоны) отдаётся лишь по секретному ключу организатора — в базе
-- хранится его sha256, не сам ключ.
create table public.events (
  slug          text primary key,
  title         text not null,
  capacity      int  not null check (capacity > 0),
  closes_at     timestamptz,
  admin_key_sha bytea not null,
  created_at    timestamptz not null default now()
);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;

create table public.event_registrations (
  id         uuid primary key default gen_random_uuid(),
  event      text not null references public.events (slug) on delete cascade,
  full_name  text not null check (char_length(full_name) between 3 and 200),
  phone      text not null check (char_length(phone) between 5 and 40),
  phone_key  text not null,
  email      text not null check (char_length(email) between 3 and 200),
  city       text not null check (char_length(city) between 1 and 100),
  workplace  text not null check (char_length(workplace) between 1 and 300),
  position   text not null check (char_length(position) between 1 and 200),
  category   text not null check (category in ('doctor', 'resident', 'student', 'company', 'other')),
  created_at timestamptz not null default now(),
  unique (event, phone_key)
);
alter table public.event_registrations enable row level security;
revoke all on public.event_registrations from anon, authenticated;
create index event_registrations_event_idx on public.event_registrations (event, created_at);

-- Сколько мест занято — для шапки формы. Чужих данных не раскрывает.
create or replace function public.event_status(p_event text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', e.title,
    'capacity', e.capacity,
    'taken', (select count(*) from public.event_registrations r where r.event = e.slug),
    'closed', e.closes_at is not null and now() >= e.closes_at
  )
  from public.events e
  where e.slug = p_event;
$$;

-- Записаться. Возвращает 'ok' | 'duplicate' | 'full' | 'closed'.
-- Блокировка по мероприятию — чтобы одновременные анкеты не перевалили лимит.
create or replace function public.event_register(
  p_event text,
  p_full_name text,
  p_phone text,
  p_email text,
  p_city text,
  p_workplace text,
  p_position text,
  p_category text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ev public.events;
  key text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
begin
  select * into ev from public.events where slug = p_event for update;
  if not found then
    raise exception 'unknown event';
  end if;
  if ev.closes_at is not null and now() >= ev.closes_at then
    return 'closed';
  end if;
  if char_length(key) < 5 then
    raise exception 'bad phone';
  end if;
  if exists (select 1 from public.event_registrations where event = p_event and phone_key = key) then
    return 'duplicate';
  end if;
  if (select count(*) from public.event_registrations where event = p_event) >= ev.capacity then
    return 'full';
  end if;
  insert into public.event_registrations
    (event, full_name, phone, phone_key, email, city, workplace, position, category)
  values
    (p_event, btrim(p_full_name), btrim(p_phone), key, lower(btrim(p_email)), btrim(p_city),
     btrim(p_workplace), btrim(p_position), p_category);
  return 'ok';
end;
$$;

-- Список анкет для организатора — только с верным ключом.
create or replace function public.event_registrations_list(p_event text, p_key text)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.events
    where slug = p_event and admin_key_sha = extensions.digest(coalesce(p_key, ''), 'sha256')
  ) then
    raise exception 'forbidden';
  end if;
  return query
    select jsonb_build_object(
      'created_at', r.created_at,
      'full_name', r.full_name,
      'phone', r.phone,
      'email', r.email,
      'city', r.city,
      'workplace', r.workplace,
      'position', r.position,
      'category', r.category
    )
    from public.event_registrations r
    where r.event = p_event
    order by r.created_at;
end;
$$;

revoke all on function public.event_status(text) from public;
revoke all on function public.event_register(text, text, text, text, text, text, text, text) from public;
revoke all on function public.event_registrations_list(text, text) from public;
grant execute on function public.event_status(text) to anon, authenticated;
grant execute on function public.event_register(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.event_registrations_list(text, text) to anon, authenticated;
