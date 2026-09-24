"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/components/tasks/DataProvider";
import { SignInMethods } from "@/components/SignInMethods";
import { AppSwitch } from "@/components/AppSwitch";
import { CURRENT_BUILD, applyUpdate, buildMoment, serverBuild } from "@/lib/update";

export default function SettingsPage() {
  const router = useRouter();
  const { profile, saveProfile } = useStore();
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
    <div className="mx-auto w-full max-w-md px-4 pb-32 pt-3">
      <h1 className="mb-4 text-xl font-semibold">Настройки</h1>

      <AppSwitch from="tasks" />

      <section className="mb-6">
        <h2 className="mb-2 text-sm" style={{ color: "var(--muted)" }}>
          Тема
        </h2>
        <div className="flex gap-2">
          {(["light", "dark"] as const).map((value) => (
            <button
              key={value}
              onClick={() => void saveProfile({ theme: value })}
              className="flex-1 rounded-2xl border px-4 py-2.5 text-sm font-medium"
              style={{
                borderColor: profile?.theme === value ? "var(--accent)" : "var(--border)",
                background: profile?.theme === value ? "var(--surface-2)" : "transparent",
              }}
            >
              {value === "light" ? "Светлая" : "Тёмная"}
            </button>
          ))}
        </div>
      </section>

      <Group>
        <Row
          label={checking ? "Проверяю…" : "Обновить приложение"}
          value={updatedAt ?? undefined}
          valueLabel="Последнее обновление"
          hint={updateNote ?? "Приложение следит за обновлениями само. Если обещанного не видно — нажмите здесь"}
          onClick={() => void checkUpdate()}
        />
      </Group>

      <Group>
        <Row
          label="Аккаунт"
          value={profile?.display_name ?? undefined}
          hint="Задачи привязаны к этой учётной записи и видны только вам"
        />
        <SignInMethods />
      </Group>

      <Group>
        <Row
          label="Выйти"
          danger
          onClick={async () => {
            await createClient().auth.signOut();
            router.replace("/login");
          }}
        />
      </Group>

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
