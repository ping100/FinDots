-- Yumdots: миллилитры для жидкостей. unit = 'g' или 'ml'; пусто — угадываем
-- по названию (кефир, сок, чай → мл). Калории считаются так же: на 100 мл.
alter table public.food_entries add column if not exists unit text check (unit in ('g', 'ml'));
alter table public.food_products add column if not exists unit text check (unit in ('g', 'ml'));

-- Единица продукта при добавлении: ставится один раз, как и сам продукт
-- (первый добавивший остаётся). Дальше менять может только админ.
create or replace function public.food_product_unit(p_barcode text, p_unit text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Нужна авторизация' using errcode = '42501';
  end if;
  if p_unit not in ('g', 'ml') then
    return;
  end if;
  update public.food_products set unit = p_unit where barcode = p_barcode and unit is null;
end;
$$;
revoke all on function public.food_product_unit(text, text) from public, anon;
grant execute on function public.food_product_unit(text, text) to authenticated;

create or replace function public.admin_food_product_unit(p_barcode text, p_unit text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  update public.food_products set unit = case when p_unit in ('g', 'ml') then p_unit end where barcode = p_barcode;
end;
$$;
revoke all on function public.admin_food_product_unit(text, text) from public, anon;
grant execute on function public.admin_food_product_unit(text, text) to authenticated;
