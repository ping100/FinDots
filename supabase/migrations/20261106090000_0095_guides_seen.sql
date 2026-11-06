-- Какие обучения уже показаны («Как пользоваться» в каждом приложении):
-- money, tasks, fem, food. В профиле, а не в браузере — чтобы на другом
-- телефоне не показывать заново.
alter table public.profiles add column if not exists guides_seen text[] not null default '{}';
grant update (guides_seen) on public.profiles to authenticated;
