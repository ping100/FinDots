-- Пуш на ответ администратора.
--
-- Как и с напоминаниями о задачах: пишет сообщение админ, база сама триггером
-- зовёт сервер приложения, а он отправляет пуш через Apple или Google.
-- Секрет и адрес сервера — те же, что и для напоминаний (reminders_secret,
-- REMINDERS_SECRET в Vercel): назначение шире, чем одни напоминания, но
-- заводить второй такой же секрет ради одной ручки незачем.

-- Админ читает подписки любого человека, чтобы прислать ему пуш — как уже
-- читает его сообщения.
drop policy "own subscriptions" on public.push_subscriptions;
create policy "own or admin read" on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Подписки на ответ по одному сообщению: кому слать и что написать.
-- Секрет проверяем так же, как в claim_due_reminders — эту ручку дёргает
-- только наш собственный сервер, никто больше.
create or replace function public.admin_reply_push_targets(p_secret text, p_message_id bigint)
returns table (endpoint text, p256dh text, auth text, body text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret') then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return query
  select s.endpoint, s.p256dh, s.auth, m.body
  from public.support_messages m
  join public.push_subscriptions s on s.user_id = m.user_id
  where m.id = p_message_id and m.from_admin;
end;
$$;

revoke execute on function public.admin_reply_push_targets(text, bigint) from public;
grant execute on function public.admin_reply_push_targets(text, bigint) to anon, authenticated;

-- Сообщение от админа появилось — будим сервер сразу, не дожидаясь
-- минутного тика планировщика: ответ на «спасибо, помогло» не обязан ждать.
create or replace function public.notify_admin_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.from_admin and exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    perform net.http_post(
      url := 'https://dotsapp.vercel.app/api/support-reply',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-reminders-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret')
      ),
      body := jsonb_build_object('message_id', new.id),
      timeout_milliseconds := 10000
    );
  end if;
  return new;
end;
$$;

create trigger support_message_notify_reply
  after insert on public.support_messages
  for each row execute function public.notify_admin_reply();
