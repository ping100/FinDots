-- При входе через Google имя приходит в метаданных: full_name у OAuth,
-- display_name у регистрации по почте. Без этого человек, зашедший через
-- Google, видел бы в настройках огрызок своего адреса вместо имени.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  );

  insert into public.exchange_rates (user_id, code, rate_to_base) values
    (new.id, 'KZT', 1), (new.id, 'RUB', 5.8), (new.id, 'USD', 520);

  return new;
end;
$$;
