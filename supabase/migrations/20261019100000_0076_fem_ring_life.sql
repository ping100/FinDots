-- Новый вид круга цикла «Жизнь цветка» (эксперимент).
alter table public.profiles drop constraint if exists profiles_fem_ring_check;
alter table public.profiles add constraint profiles_fem_ring_check
  check (fem_ring in ('flower', 'life', 'ring', 'beads', 'comet', 'petals'));
