import Link from "next/link";
import { HomeApps } from "@/components/HomeApps";
import { Greeting } from "@/components/Greeting";
import { HomeWidgets } from "@/components/HomeWidgets";
import { HomeSky } from "@/components/home/Sky";
import { SKY_SCRIPT } from "@/lib/sky";
import { createClient } from "@/lib/supabase/server";
import { Landing } from "@/components/landing/Landing";

/**
 * Развилка: одна учётная запись, несколько приложений Dots.
 *
 * Небо по времени суток, приветствие, погода с курсом и орбита — шары
 * приложений медленно кружат вокруг знака Dots. Сводка под орбитой
 * включается в шестерёнке (HomeApps). Гость видит вместо этого лендинг.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <Landing />;

  const { denied } = await searchParams;
  const deniedName = { money: "Деньги", tasks: "Задачи", fem: "Цикл" }[denied ?? ""] ?? null;

  return (
    // Скрипт красит небо до первой отрисовки — иначе мелькнёт чужое время суток.
    <HomeSky script={<script dangerouslySetInnerHTML={{ __html: SKY_SCRIPT }} />}>
      <div
        className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-5 pb-6"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 60px)" }}
      >
        <Greeting />
        <HomeWidgets delay={380} />

        {deniedName ? (
          <p className="glass mt-4 rounded-2xl px-4 py-3 text-center text-sm leading-snug" style={{ color: "#ef4444" }}>
            Доступ к разделу «{deniedName}» закрыт
          </p>
        ) : null}

        <HomeApps delay={450} />

        <p
          className="animate-lift mt-5 text-center text-[0.75rem] leading-snug"
          style={{ color: "var(--ink-2)", animationDelay: "1100ms" }}
        >
          Один вход — все приложения Dots
        </p>
        <Link
          href="/privacy"
          className="animate-lift mt-1.5 self-center text-[0.6875rem] underline decoration-dotted underline-offset-2"
          style={{ color: "var(--ink-2)", animationDelay: "1150ms" }}
        >
          Политика конфиденциальности
        </Link>
      </div>
    </HomeSky>
  );
}
