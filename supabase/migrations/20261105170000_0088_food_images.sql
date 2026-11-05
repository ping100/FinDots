-- Yumdots: картинки продуктов и продукты без штрихкода.
--
-- image_url — маленькая картинка для списка. Обычно лежит в публичном
-- бакете food-images (её туда кладёт админ, уже сжатую), а у продуктов
-- из Open Food Facts может быть и прямая ссылка на их фото упаковки.
--
-- Продукты без штрихкода (яблоко, хлеб, домашние блюда) добавляет админ.
-- Им выдаётся код вида 99 + 12 цифр: в магазине такие не встречаются,
-- поэтому со сканом настоящего штрихкода не пересекутся.

alter table public.food_products add column if not exists image_url text check (char_length(image_url) <= 500);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-images', 'food-images', true, 524288, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create policy "food images: admin write"
on storage.objects for insert to authenticated
with check (bucket_id = 'food-images' and (select public.is_admin()));

create policy "food images: admin update"
on storage.objects for update to authenticated
using (bucket_id = 'food-images' and (select public.is_admin()));

create policy "food images: admin delete"
on storage.objects for delete to authenticated
using (bucket_id = 'food-images' and (select public.is_admin()));

-- Поставить или убрать картинку продукта (админ).
create or replace function public.admin_food_product_image(p_barcode text, p_url text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  if p_url is not null and p_url !~ '^https://' then
    raise exception 'Нужна ссылка https';
  end if;
  update public.food_products set image_url = nullif(trim(p_url), '') where barcode = p_barcode;
end;
$$;
revoke all on function public.admin_food_product_image(text, text) from public, anon;
grant execute on function public.admin_food_product_image(text, text) to authenticated;

-- Фото упаковки из Open Food Facts при первом скане: только их адрес и
-- только если своей картинки ещё нет.
create or replace function public.food_product_off_image(p_barcode text, p_url text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Нужна авторизация' using errcode = '42501';
  end if;
  if p_url !~ '^https://images\.openfoodfacts\.org/' or char_length(p_url) > 500 then
    return;
  end if;
  update public.food_products set image_url = p_url where barcode = p_barcode and image_url is null;
end;
$$;
revoke all on function public.food_product_off_image(text, text) from public, anon;
grant execute on function public.food_product_off_image(text, text) to authenticated;

-- Админ добавляет продукт сразу проверенным. Без штрихкода — выдаём код 99…
create or replace function public.admin_food_product_create(
  p_barcode text, p_name text, p_brand text, p_kcal numeric, p_protein numeric, p_fat numeric, p_carbs numeric,
  p_pack_grams numeric
)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_code text := nullif(regexp_replace(coalesce(p_barcode, ''), '\D', '', 'g'), '');
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  if v_code is null then
    loop
      v_code := '99' || lpad((floor(random() * 1e12))::bigint::text, 12, '0');
      exit when not exists (select 1 from public.food_products where barcode = v_code);
    end loop;
  elsif exists (select 1 from public.food_products where barcode = v_code and status <> 'rejected') then
    raise exception 'Продукт с таким штрихкодом уже есть' using errcode = 'P0001';
  end if;
  insert into public.food_products as fp (barcode, name, brand, kcal, protein, fat, carbs, pack_grams, source, status, checked_at, updated_at)
  values (v_code, trim(p_name), nullif(trim(coalesce(p_brand, '')), ''), p_kcal, coalesce(p_protein, 0), coalesce(p_fat, 0),
          coalesce(p_carbs, 0), p_pack_grams, 'user', 'verified', now(), now())
  on conflict (barcode) do update
     set name = excluded.name, brand = excluded.brand, kcal = excluded.kcal, protein = excluded.protein,
         fat = excluded.fat, carbs = excluded.carbs, pack_grams = excluded.pack_grams, source = 'user',
         status = 'verified', checked_at = now(), updated_at = now();
  perform public.admin_log_add('Продукт добавлен', null, trim(p_name) || ' · ' || v_code);
  return v_code;
end;
$$;
revoke all on function public.admin_food_product_create(text, text, text, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.admin_food_product_create(text, text, text, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- Вкладка «Все» в модерации.
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
             when 'all' then true
             when 'queue' then fp.status = 'new' and fp.source <> 'off'
             when 'off' then fp.status = 'new' and fp.source = 'off'
             when 'noimage' then fp.image_url is null and fp.status <> 'rejected'
             else fp.status = p_status
           end
     order by fp.updated_at desc
     limit 500;
end;
$$;

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
      'all', count(*),
      'queue', count(*) filter (where status = 'new' and source <> 'off'),
      'off', count(*) filter (where status = 'new' and source = 'off'),
      'verified', count(*) filter (where status = 'verified'),
      'rejected', count(*) filter (where status = 'rejected'),
      'noimage', count(*) filter (where image_url is null and status <> 'rejected'))
    from public.food_products);
end;
$$;
