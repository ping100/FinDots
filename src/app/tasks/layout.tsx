import Link from "next/link";
import { Icon } from "@/lib/icons";

/**
 * Оболочка Todots.
 *
 * Своих провайдеров у задач нет: список короткий, грузится одним запросом
 * и живёт прямо на странице. Тянуть сюда денежный DataProvider тем более
 * незачем — кошельки и курсы валют задачам ни к чему.
 */
export default function TasksLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-safe pb-safe mx-auto min-h-dvh w-full max-w-md px-4">
      <header className="flex items-center gap-2 py-2">
        {/* Дорога назад к развилке: без неё из задач не выбраться в деньги. */}
        <Link
          href="/"
          aria-label="К выбору приложения"
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full transition active:scale-90"
          style={{ color: "var(--muted)" }}
        >
          <Icon name="chevron-left" size={20} />
        </Link>
        <h1 className="text-[1.625rem] font-semibold">Задачи</h1>
      </header>
      {children}
    </div>
  );
}
