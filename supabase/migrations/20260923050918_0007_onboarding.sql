-- Приветствие показываем один раз. Флаг живёт в профиле, а не в браузере:
-- иначе человек, который зашёл с ноутбука, а потом с телефона, увидит
-- инструкцию заново, будто он тут впервые.

alter table public.profiles
  add column onboarding_seen boolean not null default false;
