/**
 * Комиссия к трате — отдельная операция-расход без категории, привязанная
 * к своей трате через parent_id (у расходов parent_id больше ни для чего
 * не используется). Так она уменьшает баланс кошелька, но не попадает ни в
 * одну категорию: это общая статистика, по всем тратам сразу. Удалили
 * трату — база удалит и её комиссию (on delete cascade).
 */
export function isFee(t: { type: string; parent_id?: string | null }): boolean {
  return t.type === "expense" && !!t.parent_id;
}

export const FEE_LABEL = "Комиссия";
