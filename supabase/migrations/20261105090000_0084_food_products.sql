-- Yumdots: продукты по штрихкоду — общая база для всех в Dots.
-- Хранится только продукт (код, название, КБЖУ на 100 г, вес упаковки),
-- без того, кто его добавил и кто ел. Пишется только через food_product_save.
create table if not exists public.food_products (
  barcode text primary key check (barcode ~ '^[0-9]{6,14}$'),
  name text not null check (char_length(name) between 1 and 120),
  brand text check (char_length(brand) <= 80),
  kcal numeric not null check (kcal >= 0 and kcal <= 950),
  protein numeric not null default 0 check (protein >= 0 and protein <= 100),
  fat numeric not null default 0 check (fat >= 0 and fat <= 100),
  carbs numeric not null default 0 check (carbs >= 0 and carbs <= 100),
  pack_grams numeric check (pack_grams > 0 and pack_grams <= 20000),
  source text not null default 'user' check (source in ('off', 'user', 'label')),
  updated_at timestamptz not null default now()
);
alter table public.food_products enable row level security;
create policy "food_products read" on public.food_products for select to authenticated using (true);
grant select on public.food_products to authenticated;

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
  if auth.uid() is null then
    raise exception 'Нужна авторизация' using errcode = '42501';
  end if;
  insert into public.food_products as fp (barcode, name, brand, kcal, protein, fat, carbs, pack_grams, source, updated_at)
  values (p_barcode, trim(p_name), nullif(trim(coalesce(p_brand, '')), ''), p_kcal, coalesce(p_protein, 0), coalesce(p_fat, 0),
          coalesce(p_carbs, 0), p_pack_grams, coalesce(p_source, 'user'), now())
  on conflict (barcode) do update
     set name = excluded.name, brand = excluded.brand, kcal = excluded.kcal, protein = excluded.protein,
         fat = excluded.fat, carbs = excluded.carbs, pack_grams = coalesce(excluded.pack_grams, fp.pack_grams),
         source = excluded.source, updated_at = now();
end;
$$;
revoke all on function public.food_product_save(text, text, text, numeric, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.food_product_save(text, text, text, numeric, numeric, numeric, numeric, numeric, text) to authenticated;

-- Запись о еде из штрихкода.
alter table public.food_entries drop constraint if exists food_entries_source_check;
alter table public.food_entries add constraint food_entries_source_check
  check (source in ('photo', 'text', 'manual', 'repeat', 'barcode'));
