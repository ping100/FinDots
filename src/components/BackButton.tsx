"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { safeNext } from "@/lib/safeNext";

/**
 * «Назад» туда, откуда пришли. Внутри приложения браузер этого не помнит
 * (переходы идут без перезагрузки, и document.referrer пуст), поэтому
 * откуда — приходит в адресе: ?from=/tasks/settings. Нет его — на главную.
 * Адрес из ссылки проверяем, как после входа: только свои страницы.
 */
export function BackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        const from = new URLSearchParams(location.search).get("from");
        router.push(from ? safeNext(from) : fallback);
      }}
      aria-label="Назад"
      className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full"
      style={{ color: "var(--muted)" }}
    >
      <Icon name="chevron-left" size={20} />
    </button>
  );
}
