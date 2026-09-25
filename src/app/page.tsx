import Link from "next/link";
import { Logo } from "@/components/Logo";
import { HomeCard } from "@/components/HomeCard";
import { HomeAdminCard } from "@/components/HomeAdminCard";
import { Greeting } from "@/components/Greeting";

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
      {/* Поля сверху и над ссылкой внизу делят свободное место поровну:
          развилка остаётся посередине, а ссылка прижата к низу. */}
      <div className="mb-7 mt-auto flex flex-col items-center text-center">
        <Logo size={64} animated />
        <h1
          className="animate-lift mt-4 text-[1.75rem] font-semibold tracking-tight"
          style={{ animationDelay: "260ms" }}
        >
          Dots
        </h1>
        <Greeting />
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

      <Link
        href="/privacy"
        className="animate-lift mt-auto self-center pt-8 text-[0.6875rem] underline decoration-dotted underline-offset-2"
        style={{ color: "var(--muted)", animationDelay: "660ms" }}
      >
        Политика конфиденциальности
      </Link>
    </div>
  );
}
