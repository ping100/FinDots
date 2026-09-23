-- Подкатегории: уточнение внутри категории. «Продукты» остаются одним
-- кружком на главной, а внутри видно, сколько ушло в магазин, а сколько
-- на базар.
--
-- Отдельной таблицы нет: подкатегория — это та же категория со ссылкой на
-- родителя. Значит ей достаются название, цвет и иконка, а RLS, архивация
-- и редактирование работают без единой новой строчки.
--
-- Второй уровень вложенности не предусмотрен: ссылку на внука база не
-- запретит, но интерфейс его не создаёт и не показывает.

alter table public.categories
  add column parent_id uuid references public.categories (id) on delete cascade;

create index categories_parent_idx
  on public.categories (user_id, parent_id)
  where parent_id is not null;

-- В операции подкатегория лежит отдельным полем, а category_id по-прежнему
-- указывает на главную категорию. Так суммы, лимиты и отчёты продолжают
-- считаться как раньше, а подкатегория остаётся дополнительным разрезом.
alter table public.transactions
  add column subcategory_id uuid references public.categories (id) on delete set null;

create index transactions_subcategory_idx
  on public.transactions (user_id, subcategory_id)
  where subcategory_id is not null;
