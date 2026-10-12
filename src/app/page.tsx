import Link from "next/link";
import { Logo } from "@/components/Logo";
import { HomeApps } from "@/components/HomeApps";
import { Greeting } from "@/components/Greeting";
import { HomeWidgets } from "@/components/HomeWidgets";

/**
 * Развилка: одна учётная запись, несколько приложений Dots.
 *
 * Страница нарочно лёгкая — ни данных, ни провайдеров. Человек попадает
 * сюда сразу после входа, и тянуть ради пары кнопок кошельки с операциями
 * незачем. Всё, что ей нужно, уже проверено: без входа сюда не пускает
 * проверка в proxy. Какие приложения показывать — шестерёнка (HomeApps).
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { denied } = await searchParams;
  const deniedName = denied === "money" ? "Деньги" : denied === "tasks" ? "Задачи" : null;

  return (
    <div className="auth-glow mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-8">
      {/* Поля сверху и над ссылкой внизу делят свободное место поровну:
          развилка остаётся посередине, а ссылка прижата к низу. */}
      <div className="mb-7 mt-auto flex flex-col items-center text-center">
        <Logo size={64} animated="long" />
        <h1
          className="animate-lift mt-4 text-[1.75rem] font-semibold tracking-tight"
          style={{ animationDelay: "700ms" }}
        >
          Dots
        </h1>
        <Greeting />
        {/* Сначала — что снаружи (погода, курс), потом вопрос «куда»: он
            ведёт к кнопкам разделов прямо под ним. */}
        <HomeWidgets delay={780} />
        <p
          className="animate-lift mt-5 text-sm leading-snug"
          style={{ color: "var(--muted)", animationDelay: "840ms" }}
        >
          Куда пойдём?
        </p>
      </div>

      {deniedName ? (
        <p
          className="mb-4 rounded-2xl px-4 py-3 text-center text-sm leading-snug"
          style={{ background: "var(--surface)", color: "var(--danger)" }}
        >
          Доступ к разделу «{deniedName}» закрыт
        </p>
      ) : null}

      <HomeApps delay={850} />

      <p
        className="animate-lift mt-6 text-center text-xs leading-snug"
        style={{ color: "var(--muted)", animationDelay: "1060ms" }}
      >
        Учётная запись одна на все приложения — вошли один раз и пользуетесь всеми.
      </p>

      <Link
        href="/privacy"
        className="animate-lift mt-auto self-center pt-8 text-[0.6875rem] underline decoration-dotted underline-offset-2"
        style={{ color: "var(--muted)", animationDelay: "1110ms" }}
      >
        Политика конфиденциальности
      </Link>
    </div>
  );
}
