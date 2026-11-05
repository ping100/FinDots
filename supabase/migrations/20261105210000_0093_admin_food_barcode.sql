-- Админ привязывает штрихкод продукту без штрихкода (или меняет его).
-- Если этот код занят отклонённым продуктом — тот получает код 99…,
-- а штрихкод освобождается. Занят живым продуктом — ошибка.
create or replace function public.admin_food_product_barcode(p_old text, p_new text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_taken text;
  v_free text;
begin
  if not exists (select 1 from public.admins a where a.user_id = auth.uid()) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  if p_new !~ '^[0-9]{6,14}$' then
    raise exception 'Не похоже на штрихкод' using errcode = 'P0001';
  end if;
  if p_new = p_old then
    return;
  end if;
  select name into v_taken from public.food_products where barcode = p_new and status <> 'rejected';
  if v_taken is not null then
    raise exception 'Этот штрихкод уже у продукта «%»', v_taken using errcode = 'P0001';
  end if;
  if exists (select 1 from public.food_products where barcode = p_new) then
    loop
      v_free := '99' || lpad((floor(random() * 1e12))::bigint::text, 12, '0');
      exit when not exists (select 1 from public.food_products where barcode = v_free);
    end loop;
    update public.food_products set barcode = v_free where barcode = p_new;
  end if;
  update public.food_products set barcode = p_new, updated_at = now() where barcode = p_old;
  perform public.admin_log_add('Продукту привязан штрихкод', null, p_old || ' → ' || p_new);
end;
$$;
revoke all on function public.admin_food_product_barcode(text, text) from public, anon;
grant execute on function public.admin_food_product_barcode(text, text) to authenticated;
