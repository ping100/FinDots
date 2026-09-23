"use client";

import { useState } from "react";
import { Icon } from "@/lib/icons";
import { Logo } from "./Logo";
import { useStore } from "./DataProvider";
import { DataTransfer } from "./DataTransfer";
import { Guide } from "./Guide";

/**
 * Первый экран после регистрации.
 *
 * Не Sheet, а свой слой на весь экран: внутри живёт мастер импорта, который
 * сам открывает лист, а лист поверх листа ведёт себя плохо.
 *
 * Отметку о показе ставим сразу, как человек что-то выбрал, — и в профиле, а
 * не в браузере: иначе он зайдёт с другого устройства и получит приветствие
 * заново, будто он тут впервые.
 */
export function Welcome() {
  const { profile, saveProfile } = useStore();
  const [guide, setGuide] = useState(false);
  const [importing, setImporting] = useState(false);
  const [closed, setClosed] = useState(false);

  const show = !!profile && !profile.onboarding_seen && !closed;

  const finish = async () => {
    setClosed(true);
    await saveProfile({ onboarding_seen: true });
  };

  if (!show) return null;

  return (
    <div
      className="animate-fade fixed inset-0 z-[60] overflow-y-auto"
      style={{ background: "var(--bg)" }}
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size={64} animated />
          <h1 className="animate-lift mt-4 text-[1.5rem] font-semibold tracking-tight" style={{ animationDelay: "240ms" }}>
            Добро пожаловать
          </h1>
          <p
            className="animate-lift mt-1.5 text-sm leading-snug"
            style={{ color: "var(--muted)", animationDelay: "310ms" }}
          >
            Здесь пока пусто — ни кошельков, ни категорий. Всё заводится под
            себя. С чего начнём?
          </p>
        </div>

        {importing ? (
          <div className="animate-rise">
            <p className="mb-2 text-sm" style={{ color: "var(--muted)" }}>
              Выгрузите данные из старой программы в CSV и загрузите файл сюда.
              Кошельки и категории заведутся сами.
            </p>
            <DataTransfer onlyImport />
            <button
              onClick={() => setImporting(false)}
              className="mt-3 w-full text-center text-sm underline"
              style={{ color: "var(--muted)" }}
            >
              Назад
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <Choice
              icon="question"
              title="Показать, как всё устроено"
              caption="Семь картинок, меньше минуты"
              delay={380}
              onClick={() => setGuide(true)}
            />
            <Choice
              icon="list"
              title="Перенести из другой программы"
              caption="Файл CSV — операции, кошельки и категории"
              delay={440}
              onClick={() => setImporting(true)}
            />
            <Choice
              icon="grid"
              title="Начну сам"
              caption="Инструкция останется в настройках"
              delay={500}
              onClick={finish}
            />
          </div>
        )}
      </div>

      <Guide
        open={guide}
        onClose={() => {
          setGuide(false);
          void finish();
        }}
      />
    </div>
  );
}

function Choice({
  icon,
  title,
  caption,
  delay,
  onClick,
}: {
  icon: string;
  title: string;
  caption: string;
  delay: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="animate-lift flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-transform duration-100 active:scale-[0.98]"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        animationDelay: `${delay}ms`,
      }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--surface-2)", color: "var(--accent)" }}
      >
        <Icon name={icon} size={20} />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
          {caption}
        </span>
      </span>
      <Icon name="chevron-right" size={16} style={{ color: "var(--muted)" }} />
    </button>
  );
}
