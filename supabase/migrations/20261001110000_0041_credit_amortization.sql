-- Тип графика платежей по кредиту и предпочтительный кошелёк для его оплаты.
--
-- amortization_method — только для кредитов (debt_out с monthly_payment):
-- аннуитет — платёж одинаковый весь срок, равными долями — тело фиксировано,
-- а платёж падает по мере уменьшения процентов. Выбирается при заведении
-- кредита, по умолчанию аннуитет — так чаще всего в банках.
--
-- pay_from_wallet_id — какой кошелёк показывать первым при оплате этого
-- кредита (не ограничение, просто подсказка в списке выбора).

alter table public.wallets add column amortization_method text
  check (amortization_method is null or amortization_method in ('annuity', 'equal'));

alter table public.wallets add column pay_from_wallet_id uuid
  references public.wallets(id) on delete set null;
