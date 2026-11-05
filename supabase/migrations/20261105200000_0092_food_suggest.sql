-- Yumdots: предложить своё блюдо (записанное словами, фото или вручную) в
-- общую базу. Значения уже на 100 г / 100 мл. Попадает на проверку админу;
-- штрихкода нет — выдаём код 99… Повтор названия не создаёт дубль.
create or replace function public.food_product_suggest(
  p_name text, p_kcal numeric, p_protein numeric, p_fat numeric, p_carbs numeric, p_pack_grams numeric, p_unit text
)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_n int;
  v_code text;
  v_name text := trim(p_name);
begin
  if auth.uid() is null then
    raise exception 'Нужна авторизация' using errcode = '42501';
  end if;
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'Нужно название' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.food_products fp
              where lower(replace(fp.name, 'ё', 'е')) = lower(replace(v_name, 'ё', 'е')) and fp.status <> 'rejected') then
    return 'exists';
  end if;
  select n into v_n from public.food_product_adds where user_id = auth.uid() and day = v_today;
  if coalesce(v_n, 0) >= 30 then
    raise exception 'На сегодня добавлено слишком много новых продуктов, попробуйте завтра' using errcode = 'P0001';
  end if;
  insert into public.food_product_adds (user_id, day, n) values (auth.uid(), v_today, 1)
    on conflict (user_id, day) do update set n = public.food_product_adds.n + 1;
  loop
    v_code := '99' || lpad((floor(random() * 1e12))::bigint::text, 12, '0');
    exit when not exists (select 1 from public.food_products where barcode = v_code);
  end loop;
  insert into public.food_products (barcode, name, brand, kcal, protein, fat, carbs, pack_grams, source, status, unit, updated_at)
  values (v_code, v_name, null, least(p_kcal, 950), least(coalesce(p_protein, 0), 100), least(coalesce(p_fat, 0), 100),
          least(coalesce(p_carbs, 0), 100), p_pack_grams, 'user', 'new',
          case when p_unit in ('g', 'ml') then p_unit end, now());
  return 'added';
end;
$$;
revoke all on function public.food_product_suggest(text, numeric, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.food_product_suggest(text, numeric, numeric, numeric, numeric, numeric, text) to authenticated;
