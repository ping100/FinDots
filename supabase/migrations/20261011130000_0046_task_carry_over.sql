-- «Переносить на следующий день»: невыполненная задача с этим флажком
-- сама переезжает на сегодня (по часовому поясу человека), даже если
-- приложение не открывали. Без флажка она остаётся на своём дне и видна
-- в блоке «Пропущено» на экране «Сегодня».

alter table public.tasks add column carry_over boolean not null default false;
-- С какого дня задача переезжает — чтобы показать «перенесено с 10 окт».
-- Сбрасывается, когда человек сам ставит задаче другой день.
alter table public.tasks add column carried_from date;

create index tasks_carry_over_idx on public.tasks (date) where carry_over and not done;

-- Смена даты сбрасывает reminded_at (триггер tasks_reset_reminder), так
-- что напоминание ко времени сработает и в новый день.
create function public.carry_over_tasks()
returns void
language sql security definer set search_path to ''
as $$
  update public.tasks t
     set carried_from = coalesce(t.carried_from, t.date),
         date = (now() at time zone coalesce(p.time_zone, 'Asia/Almaty'))::date
    from public.profiles p
   where p.id = t.user_id
     and t.carry_over and not t.done and t.date is not null
     and t.date < (now() at time zone coalesce(p.time_zone, 'Asia/Almaty'))::date;
$$;

revoke all on function public.carry_over_tasks() from public, anon, authenticated;

select cron.schedule('carry-over-tasks', '*/10 * * * *', 'select public.carry_over_tasks()');
