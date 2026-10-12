-- FemDots: дневник дня как во Flo и общая близость пары.
--
-- fem_days.tags — новые разделы дневника одним массивом с префиксами:
-- d: — выделения, s: — близость (подробности, только ей), x: — желание,
-- o: — другое (стресс, путешествие…), a: — активность.
alter table public.fem_days
  add column tags text[] not null default '{}',
  add column weight numeric(5, 1) check (weight between 25 and 300),
  add column preg_test text check (preg_test in ('none', 'neg', 'faint', 'pos'));

-- Близость — общая для двоих: сердечко в календаре у обоих. Отмечать
-- может и она (напрямую, RLS own), и партнёр (функцией ниже). Подробности
-- остаются в её fem_days.tags и партнёру не видны. Снятая отметка —
-- active = false (строка остаётся, чтобы не терять, кто отметил).
create table public.fem_intimacy (
  owner_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  protected boolean,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  active boolean not null default true,
  primary key (owner_id, day)
);
alter table public.fem_intimacy enable row level security;
create policy "fem intimacy: own" on public.fem_intimacy for all
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke all on public.fem_intimacy from anon;
grant select, insert, update, delete on public.fem_intimacy to authenticated;

create function public.fem_partner_intimacy(p_day date, p_protected boolean, p_on boolean)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then raise exception 'Нет входа' using errcode = '42501'; end if;
  select owner_id into v_owner from public.fem_shares where partner_id = auth.uid() and active;
  if v_owner is null then raise exception 'Вы не подключены к циклу'; end if;
  if p_day > current_date + 1 or p_day < current_date - 400 then raise exception 'Неверная дата'; end if;
  insert into public.fem_intimacy (owner_id, day, protected, added_by, active)
  values (v_owner, p_day, p_protected, auth.uid(), p_on)
  on conflict (owner_id, day) do update
    set protected = excluded.protected, active = excluded.active, added_by = excluded.added_by, created_at = now();
end;
$$;
revoke all on function public.fem_partner_intimacy(date, boolean, boolean) from public, anon;
grant execute on function public.fem_partner_intimacy(date, boolean, boolean) to authenticated;

-- Виды близости — общие для пары (иконка в сердечке у обоих): sex — секс
-- (protected — с защитой или без), oral, anal, touch. Личное (мастурбация,
-- игрушки) — только в её fem_days.tags.
alter table public.fem_intimacy add column kinds text[] not null default '{sex}'
  check (kinds <@ array['sex', 'oral', 'anal', 'touch']::text[]);

create function public.fem_partner_intimacy_set(p_day date, p_kinds text[], p_protected boolean)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then raise exception 'Нет входа' using errcode = '42501'; end if;
  select owner_id into v_owner from public.fem_shares where partner_id = auth.uid() and active;
  if v_owner is null then raise exception 'Вы не подключены к циклу'; end if;
  if p_day > current_date + 1 or p_day < current_date - 400 then raise exception 'Неверная дата'; end if;
  insert into public.fem_intimacy (owner_id, day, protected, kinds, added_by, active)
  values (v_owner, p_day, p_protected, coalesce(p_kinds, '{}'), auth.uid(), cardinality(coalesce(p_kinds, '{}')) > 0)
  on conflict (owner_id, day) do update
    set protected = excluded.protected, kinds = excluded.kinds, active = excluded.active,
        added_by = excluded.added_by, created_at = now();
end;
$$;
revoke all on function public.fem_partner_intimacy_set(date, text[], boolean) from public, anon;
grant execute on function public.fem_partner_intimacy_set(date, text[], boolean) to authenticated;

-- Партнёр видит отметки близости (дни, виды, с защитой или без).
create or replace function public.fem_partner_view()
returns jsonb
language sql stable security definer set search_path to ''
as $$
  select jsonb_build_object(
    'owner_name', coalesce(nullif(trim(p.display_name), ''), 'Партнёрша'),
    'cycle_length', coalesce(fs.cycle_length, 28),
    'period_length', coalesce(fs.period_length, 5),
    'remind', s.partner_remind,
    'share_mood', s.share_mood,
    'share_symptoms', s.share_symptoms,
    'share_status', s.share_status,
    'hormonal', coalesce(fs.method not in ('none', 'iud_copper'), false),
    'goal', case when s.share_goal then fs.goal end,
    'pill_nudge', s.pill_nudge,
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object('id', fp.id, 'start_date', fp.start_date, 'end_date', fp.end_date) order by fp.start_date)
        from public.fem_periods fp where fp.user_id = s.owner_id
    ), '[]'::jsonb),
    'lh_days', coalesce((
      select jsonb_agg(d.day order by d.day)
        from public.fem_days d
       where d.user_id = s.owner_id and d.lh = 'pos' and d.day > current_date - 200
    ), '[]'::jsonb),
    -- Близость — общая для двоих: сердечко и «с защитой / без».
    'intimacy', coalesce((
      select jsonb_agg(jsonb_build_object('day', i.day, 'protected', i.protected, 'kinds', i.kinds) order by i.day)
        from public.fem_intimacy i
       where i.owner_id = s.owner_id and i.active and i.day > current_date - 400
    ), '[]'::jsonb),
    'today', (
      select jsonb_build_object(
        'mood', case when s.share_mood then d.mood end,
        'symptoms', case when s.share_symptoms then to_jsonb(d.symptoms) else '[]'::jsonb end,
        'status', case when s.share_status then d.status end
      )
        from public.fem_days d
       where d.user_id = s.owner_id
         and d.day = (now() at time zone coalesce(p.time_zone, 'Asia/Almaty'))::date
    )
  )
    from public.fem_shares s
    join public.profiles p on p.id = s.owner_id
    left join public.fem_settings fs on fs.user_id = s.owner_id
   where s.partner_id = auth.uid() and s.active;
$$;
