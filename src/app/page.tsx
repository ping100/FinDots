import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Icon } from "@/lib/icons";

/**
 * Развилка: одна учётная запись, два приложения.
 *
 * Страница нарочно лёгкая — ни данных, ни провайдеров. Человек попадает
 * сюда сразу после входа, и тянуть ради двух кнопок кошельки с операциями
 * незачем. Всё, что ей нужно, уже проверено: без входа сюда не пускает
 * проверка в proxy.
 */
const APPS = [
  {
    href: "/money",
    name: "Findots",
    what: "Деньги",
    hint: "Сколько есть, сколько ушло и сколько можно потратить сегодня",
    icon: "wallet",
    color: "#22c55e",
  },
  {
    href: "/tasks",
    name: "Todots",
    what: "Задачи",
    hint: "Что сделать сегодня, что переносится и что горит",
    icon: "list",
    color: "#60a5fa",
  },
];

export default function Home() {
  return (
    <div className="auth-glow mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-8">
      <div className="mb-7 flex flex-col items-center text-center">
        <Logo size={64} animated />
        <h1
          className="animate-lift mt-4 text-[1.75rem] font-semibold tracking-tight"
          style={{ animationDelay: "260ms" }}
        >
          Dots
        </h1>
        <p
          className="animate-lift mt-1.5 text-sm leading-snug"
          style={{ color: "var(--muted)", animationDelay: "330ms" }}
        >
          Куда пойдём?
        </p>
      </div>

      <div className="space-y-3">
        {APPS.map((app, index) => (
          <Link
            key={app.href}
            href={app.href}
            className="animate-lift flex items-center gap-4 rounded-3xl p-4 transition active:scale-[0.98]"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              animationDelay: `${400 + index * 70}ms`,
            }}
          >
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
              style={{ background: app.color }}
            >
              <Icon name={app.icon} size={24} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[1.0625rem] font-semibold">{app.what}</span>
              <span
                className="mt-0.5 block text-[0.75rem] leading-snug"
                style={{ color: "var(--muted)" }}
              >
                {app.hint}
              </span>
            </span>
            <Icon name="chevron-right" size={18} className="shrink-0 opacity-30" />
          </Link>
        ))}
      </div>

      <p
        className="animate-lift mt-6 text-center text-xs leading-snug"
        style={{ color: "var(--muted)", animationDelay: "560ms" }}
      >
        Учётная запись одна на оба — вошли один раз и пользуетесь обоими.
      </p>
    </div>
  );
}
