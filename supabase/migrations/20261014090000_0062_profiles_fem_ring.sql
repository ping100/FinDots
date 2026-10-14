-- Вид круга цикла в FemDots: цветок (по умолчанию, null), кольцо, бусины,
-- комета, лепестки. Свой у неё и у партнёра — поэтому в профиле.
alter table public.profiles add column if not exists fem_ring text
  check (fem_ring in ('flower', 'ring', 'beads', 'comet', 'petals'));

grant update (fem_ring) on public.profiles to authenticated;
