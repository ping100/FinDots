import { Logo } from "@/components/Logo";
import { HomeCard } from "@/components/HomeCard";
import { HomeAdminCard } from "@/components/HomeAdminCard";

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
          <HomeCard
            key={app.href}
            href={app.href}
            title={app.what}
            hint={app.hint}
            icon={app.icon}
            color={app.color}
            delay={400 + index * 70}
          />
        ))}
        <HomeAdminCard delay={540} />
      </div>

      <p
        className="animate-lift mt-6 text-center text-xs leading-snug"
        style={{ color: "var(--muted)", animationDelay: "610ms" }}
      >
        Учётная запись одна на оба — вошли один раз и пользуетесь обоими.
      </p>
    </div>
  );
}
