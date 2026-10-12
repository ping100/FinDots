-- FemDots: разбор цикла нейросетью — только после отдельного согласия:
-- обезличенная сводка (длины циклов, частота симптомов и настроения, без
-- имени и заметок) уходит в OpenRouter. Пусто — согласия нет.
alter table public.fem_settings add column ai_consent_at timestamptz;
