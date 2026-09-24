"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/components/DataProvider";
import { CategoryEditor } from "@/components/CategoryEditor";
import { Button } from "@/components/ui";
import type { TaskCategory } from "@/lib/types";

export default function SettingsPage() {
  const router = useRouter();
  const { profile, categories, saveProfile, saveCategory, deleteCategory } = useStore();
  const [editing, setEditing] = useState<TaskCategory | null | undefined>(undefined);

  const live = categories.filter((c) => !c.archived);

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32 pt-3">
      <h1 className="mb-4 text-xl font-semibold">Настройки</h1>

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

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm" style={{ color: "var(--muted)" }}>
            Категории
          </h2>
          <button
            onClick={() => setEditing(null)}
            className="flex items-center gap-1 text-sm font-medium"
            style={{ color: "var(--accent)" }}
          >
            <Icon name="plus" size={15} />
            Добавить
          </button>
        </div>
        {live.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Пока ни одной — задачи можно оставлять и без категории.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--border)" }}>
            {live.map((category, index) => (
              <button
                key={category.id}
                onClick={() => setEditing(category)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
                style={{ borderTop: index ? "1px solid var(--border)" : undefined }}
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white"
                  style={{ background: category.color }}
                >
                  <Icon name={category.icon} size={17} />
                </span>
                <span className="flex-1 text-sm font-medium">{category.name}</span>
                <Icon name="chevron-right" size={16} />
              </button>
            ))}
          </div>
        )}
      </section>

      <Button
        variant="ghost"
        onClick={async () => {
          await createClient().auth.signOut();
          router.replace("/login");
        }}
      >
        Выйти
      </Button>

      <CategoryEditor
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        category={editing ?? null}
        onSave={saveCategory}
        onDelete={deleteCategory}
      />
    </div>
  );
}
