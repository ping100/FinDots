-- Yumdots: модерация общей базы продуктов.
-- new — ещё не смотрели, verified — «Проверено Dots», rejected — отклонён
-- (не показывается, и штрихкод можно добавить заново).
alter table public.food_products add column if not exists status text not null default 'new'
  check (status in ('new', 'verified', 'rejected'));
alter table public.food_products add column if not exists checked_at timestamptz;
create index if not exists food_products_status on public.food_products (status, updated_at desc);

create or replace function public.food_product_add(
  p_barcode text, p_name text, p_brand text, p_kcal numeric, p_protein numeric, p_fat numeric, p_carbs numeric,
  p_pack_grams numeric, p_source text
)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_n int;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Нужна авторизация' using errcode = '42501';
  end if;
  select status into v_status from public.food_products where barcode = p_barcode;
  -- Есть и не отклонён — первый добавивший остаётся.
  if v_status is not null and v_status <> 'rejected' then
    return 'exists';
  end if;
  if coalesce(p_source, 'user') <> 'off' then
    select n into v_n from public.food_product_adds where user_id = auth.uid() and day = v_today;
    if coalesce(v_n, 0) >= 30 then
      raise exception 'На сегодня добавлено слишком много новых продуктов, попробуйте завтра' using errcode = 'P0001';
    end if;
    insert into public.food_product_adds (user_id, day, n) values (auth.uid(), v_today, 1)
      on conflict (user_id, day) do update set n = public.food_product_adds.n + 1;
  end if;
  insert into public.food_products as fp (barcode, name, brand, kcal, protein, fat, carbs, pack_grams, source, status, checked_at, updated_at)
  values (p_barcode, trim(p_name), nullif(trim(coalesce(p_brand, '')), ''), p_kcal, coalesce(p_protein, 0), coalesce(p_fat, 0),
          coalesce(p_carbs, 0), p_pack_grams, coalesce(p_source, 'user'), 'new', null, now())
  on conflict (barcode) do update
     set name = excluded.name, brand = excluded.brand, kcal = excluded.kcal, protein = excluded.protein,
         fat = excluded.fat, carbs = excluded.carbs, pack_grams = excluded.pack_grams, source = excluded.source,
         status = 'new', checked_at = null, updated_at = now()
   where fp.status = 'rejected';
  return 'added';
end;
$$;

-- Админка: список по статусу и счётчики.
create or replace function public.admin_food_products(p_status text)
returns setof public.food_products
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return query
    select * from public.food_products fp
     where case p_status
             when 'queue' then fp.status = 'new' and fp.source <> 'off'
             when 'off' then fp.status = 'new' and fp.source = 'off'
             else fp.status = p_status
           end
     order by fp.updated_at desc
     limit 300;
end;
$$;
revoke all on function public.admin_food_products(text) from public, anon;
grant execute on function public.admin_food_products(text) to authenticated;

create or replace function public.admin_food_counts()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'queue', count(*) filter (where status = 'new' and source <> 'off'),
      'off', count(*) filter (where status = 'new' and source = 'off'),
      'verified', count(*) filter (where status = 'verified'),
      'rejected', count(*) filter (where status = 'rejected'))
    from public.food_products);
end;
$$;
revoke all on function public.admin_food_counts() from public, anon;
grant execute on function public.admin_food_counts() to authenticated;

-- Одобрить / отклонить / исправить и одобрить.
create or replace function public.admin_food_product_set(
  p_barcode text, p_status text, p_name text default null, p_brand text default null, p_kcal numeric default null,
  p_protein numeric default null, p_fat numeric default null, p_carbs numeric default null, p_pack_grams numeric default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_name text;
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  if p_status not in ('new', 'verified', 'rejected') then
    raise exception 'Неизвестный статус';
  end if;
  update public.food_products
     set status = p_status,
         checked_at = case when p_status = 'new' then null else now() end,
         name = coalesce(nullif(trim(p_name), ''), name),
         brand = case when p_name is null then brand else nullif(trim(coalesce(p_brand, '')), '') end,
         kcal = coalesce(p_kcal, kcal), protein = coalesce(p_protein, protein), fat = coalesce(p_fat, fat),
         carbs = coalesce(p_carbs, carbs),
         pack_grams = case when p_name is null then pack_grams else p_pack_grams end,
         updated_at = now()
   where barcode = p_barcode
   returning name into v_name;
  if v_name is null then
    raise exception 'Продукт не найден';
  end if;
  perform public.admin_log_add(
    case p_status when 'verified' then 'Продукт проверен' when 'rejected' then 'Продукт отклонён' else 'Продукт на проверку' end,
    null, v_name || ' · ' || p_barcode);
end;
$$;
revoke all on function public.admin_food_product_set(text, text, text, text, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.admin_food_product_set(text, text, text, text, numeric, numeric, numeric, numeric, numeric) to authenticated;
