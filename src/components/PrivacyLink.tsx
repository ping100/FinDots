import Link from "next/link";
import { Icon } from "@/lib/icons";

/**
 * Строка «Политика конфиденциальности» в настройках. Та же разметка, что у
 * соседних строк: стоит внутри общей группы «Помощь».
 */
export function PrivacyLink({ from }: { from: string }) {
  return (
    <Link
      // Откуда пришли — в ссылке: «назад» на странице политики вернёт сюда.
      href={`/privacy?from=${encodeURIComponent(from)}`}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left [&:not(:first-child)]:border-t"
      style={{ borderColor: "var(--border)" }}
    >
      <span className="flex-1">
        <span className="block text-[0.9375rem]">Политика конфиденциальности</span>
        <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
          Что хранится, где и кто это видит
        </span>
      </span>
      <Icon name="chevron-right" size={16} className="opacity-30" />
    </Link>
  );
}
