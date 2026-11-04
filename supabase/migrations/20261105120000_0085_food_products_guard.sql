-- Yumdots: защита общей базы продуктов от перезаписи и мусора.
-- Первый добавивший штрихкод остаётся; новых продуктов — не больше 30
-- в день на человека (считаем только количество, без самих продуктов).
create table if not exists public.food_product_adds (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (user_id, day)
);
alter table public.food_product_adds enable row level security;
revoke all on public.food_product_adds from anon, authenticated;

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
begin
  if auth.uid() is null then
    raise exception 'Нужна авторизация' using errcode = '42501';
  end if;
  if exists (select 1 from public.food_products where barcode = p_barcode) then
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
  insert into public.food_products (barcode, name, brand, kcal, protein, fat, carbs, pack_grams, source, updated_at)
  values (p_barcode, trim(p_name), nullif(trim(coalesce(p_brand, '')), ''), p_kcal, coalesce(p_protein, 0), coalesce(p_fat, 0),
          coalesce(p_carbs, 0), p_pack_grams, coalesce(p_source, 'user'), now())
  on conflict (barcode) do nothing;
  return 'added';
end;
$$;
revoke all on function public.food_product_add(text, text, text, numeric, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.food_product_add(text, text, text, numeric, numeric, numeric, numeric, numeric, text) to authenticated;

-- Старая функция больше не перезаписывает: то же, что food_product_add.
create or replace function public.food_product_save(
  p_barcode text, p_name text, p_brand text, p_kcal numeric, p_protein numeric, p_fat numeric, p_carbs numeric,
  p_pack_grams numeric, p_source text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform public.food_product_add(p_barcode, p_name, p_brand, p_kcal, p_protein, p_fat, p_carbs, p_pack_grams, p_source);
end;
$$;
