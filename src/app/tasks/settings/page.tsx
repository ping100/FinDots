"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { THEMES, THEME_AUTO_HINT } from "@/lib/look";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/components/tasks/DataProvider";
import { SignInMethods } from "@/components/SignInMethods";
import { UserNumber } from "@/components/UserNumber";
import { SupportRow } from "@/components/SupportRow";
import { SettingsHeading } from "@/components/SettingsHeading";
import { PrivacyLink } from "@/components/PrivacyLink";
import { TEXT_SCALES } from "@/lib/textScale";
import { PushSettings } from "@/components/tasks/PushSettings";
import { disablePush } from "@/lib/pushClient";
import { AccountCard } from "@/components/AccountCard";
import { AppSwitch } from "@/components/AppSwitch";
import { AdminLink } from "@/components/AdminLink";
import { CategoryEditor } from "@/components/tasks/CategoryEditor";
import type { TaskCategory } from "@/lib/tasks/types";
import { CURRENT_BUILD, applyUpdate, buildMoment, serverBuild } from "@/lib/update";

export default function SettingsPage() {
  const router = useRouter();
  const { profile, categories, saveCategory, deleteCategory, saveProfile } = useStore();
  const [editingCategory, setEditingCategory] = useState<TaskCategory | null | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const [updateNote, setUpdateNote] = useState<string | null>(null);
  // Считаем после отрисовки: строка зависит от часового пояса телефона, а
  // на сервере он другой — React заметил бы расхождение.
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  useEffect(() => setUpdatedAt(buildMoment()), []);

  const checkUpdate = async () => {
    if (checking) return;
    setChecking(true);
    setUpdateNote(null);
    const build = await serverBuild();
    if (!build) setUpdateNote("Не дозвонились до сервера — проверьте интернет");
    else if (build === CURRENT_BUILD) setUpdateNote("У вас последняя версия");
    else {
      setUpdateNote("Есть новая версия, обновляю…");
      await applyUpdate();
      return;
    }
    setChecking(false);
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <h1 className="py-2 text-[1.625rem] font-semibold">Настройки</h1>

      <SettingsHeading>Профиль</SettingsHeading>
      <Group>
        <AccountCard
          name={profile?.display_name}
          hint="Задачи привязаны к этой учётной записи и видны только вам"
          onSaveName={(display_name) => saveProfile({ display_name })}
        />
        <UserNumber />
        <SignInMethods />
      </Group>

      <SettingsHeading>Напоминания</SettingsHeading>
      <PushSettings />

      <SettingsHeading hint={THEME_AUTO_HINT}>Оформление</SettingsHeading>
      <div className="mb-4 space-y-3 rounded-2xl p-4" style={{ background: "var(--surface)" }}>
        <div>
          <p className="mb-2 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            Тема
          </p>
          <div className="flex gap-2">
            {THEMES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => void saveProfile({ theme: id })}
                className="flex-1 rounded-2xl border px-3 py-2.5 text-sm font-medium"
                style={{
                  borderColor: profile?.theme === id ? "var(--accent)" : "var(--border)",
                  background: profile?.theme === id ? "var(--surface-2)" : "transparent",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            Размер шрифта — общий с деньгами
          </p>
          <div className="flex gap-2">
            {TEXT_SCALES.map((item) => {
              const on = (profile?.text_scale ?? "medium") === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => void saveProfile({ text_scale: item.id })}
                  className="flex-1 rounded-2xl border px-3 py-2.5 font-medium"
                  style={{
                    // Размер надписи и есть предпросмотр выбора.
                    fontSize: `${0.875 * item.factor}rem`,
                    borderColor: on ? "var(--accent)" : "var(--border)",
                    background: on ? "var(--surface-2)" : "transparent",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <SettingsHeading>Категории</SettingsHeading>
      {categories.filter((c) => !c.archived).length === 0 ? (
        <p className="-mt-1 mb-2 px-1 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
          Пока ни одной — задачи можно оставлять и без категории.
        </p>
      ) : null}
      <Group>
        {categories
          .filter((c) => !c.archived)
          .map((category) => (
            <button
              key={category.id}
              onClick={() => setEditingCategory(category)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left [&:not(:first-child)]:border-t"
              style={{ borderColor: "var(--border)" }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                style={{ background: category.color }}
              >
                <Icon name={category.icon} size={17} />
              </span>
              <span className="flex-1 text-[0.9375rem]">{category.name}</span>
              <Icon name="chevron-right" size={16} className="opacity-30" />
            </button>
          ))}
        <button
          onClick={() => setEditingCategory(null)}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left [&:not(:first-child)]:border-t"
          style={{ borderColor: "var(--border)", color: "var(--accent)" }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--surface-2)" }}>
            <Icon name="plus" size={17} />
          </span>
          <span className="flex-1 text-[0.9375rem] font-medium">Добавить категорию</span>
        </button>
      </Group>

      <SettingsHeading>Помощь</SettingsHeading>
      <Group>
        <PrivacyLink from="/tasks/settings" />
      </Group>
      <SupportRow />

      <SettingsHeading>Приложения</SettingsHeading>
      <AppSwitch from="tasks" />
      <AdminLink />

      <Group>
        <Row
          label="Выйти"
          danger
          onClick={async () => {
            // Вышел — напоминания этого человека сюда больше не идут.
            await disablePush().catch(() => undefined);
            await createClient().auth.signOut();
            router.replace("/login");
          }}
        />
      </Group>

      <Group>
        <Row
          label={checking ? "Проверяю…" : "Обновить приложение"}
          value={updatedAt ?? undefined}
          valueLabel="Последнее обновление"
          hint={updateNote ?? "Приложение следит за обновлениями само. Если обещанного не видно — нажмите здесь"}
          onClick={() => void checkUpdate()}
        />
      </Group>

      <CategoryEditor
        open={editingCategory !== undefined}
        onClose={() => setEditingCategory(undefined)}
        category={editingCategory ?? null}
        onSave={saveCategory}
        onDelete={deleteCategory}
      />
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl" style={{ background: "var(--surface)" }}>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  valueLabel,
  hint,
  danger,
  onClick,
}: {
  label: string;
  value?: string;
  /** Что означает число справа. Без подписи «сегодня, 19:56» ни о чём. */
  valueLabel?: string;
  hint?: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="flex-1">
        <span
          className="block text-[0.9375rem]"
          style={{ color: danger ? "var(--danger)" : undefined }}
        >
          {label}
        </span>
        {hint ? (
          <span
            className="mt-0.5 block text-[0.6875rem] leading-snug"
            style={{ color: "var(--muted)" }}
          >
            {hint}
          </span>
        ) : null}
      </span>
      {value ? (
        <span className="shrink-0 text-right">
          {valueLabel ? (
            <span className="block text-[0.625rem]" style={{ color: "var(--muted)" }}>
              {valueLabel}
            </span>
          ) : null}
          <span className="block text-[0.9375rem]" style={{ color: "var(--muted)" }}>
            {value}
          </span>
        </span>
      ) : null}
      {onClick && !danger ? <Icon name="chevron-right" size={16} className="opacity-30" /> : null}
    </>
  );

  const className =
    "flex w-full items-center gap-3 px-4 py-3.5 text-left [&:not(:first-child)]:border-t";
  const style = { borderColor: "var(--border)" };

  return onClick ? (
    <button onClick={onClick} className={className} style={style}>
      {content}
    </button>
  ) : (
    <div className={className} style={style}>
      {content}
    </div>
  );
}
