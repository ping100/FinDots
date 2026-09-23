-- Идентификаторы моделей OpenRouter живут недолго: четыре бесплатные модели
-- из первоначального списка исчезли, и разбор бюджета стал отвечать «404».
-- Список в приложении теперь подтягивается у OpenRouter живьём, но значение
-- по умолчанию и уже записанные в профилях модели нужно поправить руками.

alter table public.profiles
  alter column ai_model set default 'google/gemma-4-31b-it:free';

update public.profiles
   set ai_model = 'google/gemma-4-31b-it:free'
 where ai_model in (
   'meta-llama/llama-3.3-70b-instruct:free',
   'deepseek/deepseek-chat-v3-0324:free',
   'google/gemini-2.0-flash-exp:free',
   'qwen/qwen-2.5-72b-instruct:free'
 );
