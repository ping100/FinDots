-- Комиссия к трате: расход без категории, привязанный к своей трате через
-- parent_id. Категории у неё нет нарочно — комиссии считаются отдельной
-- общей статистикой, не внутри «Еды» или «Кафе». Удаление траты удаляет и
-- комиссию (parent_id ... on delete cascade уже есть).
alter table public.transactions drop constraint shape_ok;
alter table public.transactions add constraint shape_ok check (
  (type = 'income'     and category_id is not null and wallet_id is null) or
  (type = 'allocation' and wallet_id   is not null and parent_id is not null) or
  (type = 'expense'    and wallet_id   is not null and (category_id is not null or parent_id is not null)) or
  (type = 'transfer'   and from_wallet_id is not null and to_wallet_id is not null
                       and from_wallet_id <> to_wallet_id) or
  (type = 'adjustment' and wallet_id is not null)
);
