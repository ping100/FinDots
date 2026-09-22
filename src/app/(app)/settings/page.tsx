"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AI_MODELS } from "@/lib/aiModels";
import { CURRENCIES, parseAmount } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/components/DataProvider";
import { Button, Field, inputClass, inputStyle } from "@/components/ui";

export default function SettingsPage() {
  const router = useRouter();
  const { profile, rates, saveProfile, saveRate } = useStore();
  const [model, setModel] = useState(profile?.ai_model ?? AI_MODELS[0].id);

  const base = profile?.base_currency ?? "KZT";

  const signOut = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-28 pt-3">
      <h1 className="mb-4 text-xl font-bold">Настройки</h1>

      <Card title="Основная валюта" hint="В ней считаются итоги и сравнение месяцев">
        <div className="flex gap-2">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              onClick={() => saveProfile({ base_currency: c.code })}
              className="flex-1 rounded-2xl border px-3 py-2.5 text-sm"
              style={{
                background: base === c.code ? "var(--accent)" : "var(--surface-2)",
                borderColor: base === c.code ? "var(--accent)" : "var(--border)",
                color: base === c.code ? "#fff" : "inherit",
              }}
            >
              {c.symbol} {c.code}
            </button>
          ))}
        </div>
      </Card>

      <Card
        title="Курсы валют"
        hint={`Сколько ${base} стоит одна единица валюты. Правится вручную — автоподгрузки курсов нет.`}
      >
        {CURRENCIES.filter((c) => c.code !== base).map((c) => (
          <RateRow
            key={c.code}
            code={c.code}
            base={base}
            value={rates.find((r) => r.code === c.code)?.rate_to_base ?? 1}
            onSave={(v) => saveRate(c.code, v)}
          />
        ))}
      </Card>

      <Card title="Тема">
        <div className="flex gap-2">
          {(["dark", "light"] as const).map((theme) => (
            <button
              key={theme}
              onClick={() => saveProfile({ theme })}
              className="flex-1 rounded-2xl border px-3 py-2.5 text-sm"
              style={{
                background: profile?.theme === theme ? "var(--accent)" : "var(--surface-2)",
                borderColor: profile?.theme === theme ? "var(--accent)" : "var(--border)",
                color: profile?.theme === theme ? "#fff" : "inherit",
              }}
            >
              {theme === "dark" ? "Тёмная" : "Светлая"}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Модель для разбора бюджета" hint="Через OpenRouter. Со значком «free» — бесплатные.">
        <select
          className={inputClass + " mb-2"}
          style={inputStyle}
          value={AI_MODELS.some((m) => m.id === model) ? model : "custom"}
          onChange={(e) => {
            if (e.target.value === "custom") return;
            setModel(e.target.value);
            void saveProfile({ ai_model: e.target.value });
          }}
        >
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.free ? " · free" : ""}
            </option>
          ))}
          <option value="custom">Другая — вписать вручную</option>
        </select>
        <input
          className={inputClass}
          style={inputStyle}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onBlur={() => saveProfile({ ai_model: model })}
          placeholder="идентификатор модели OpenRouter"
        />
      </Card>

      <Card title="Аккаунт" hint={profile?.display_name ?? undefined}>
        <Button variant="ghost" onClick={signOut}>
          Выйти
        </Button>
      </Card>

      <p className="mt-6 text-center text-[11px]" style={{ color: "var(--muted)" }}>
        Категории и кошельки правятся на главном экране: тап по кошельку, долгое
        нажатие на категорию.
      </p>
    </div>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mb-4 rounded-3xl p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint ? (
        <p className="mb-3 mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
          {hint}
        </p>
      ) : (
        <div className="mb-3" />
      )}
      {children}
    </section>
  );
}

function RateRow({
  code,
  base,
  value,
  onSave,
}: {
  code: string;
  base: string;
  value: number;
  onSave: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  return (
    <Field label={`1 ${code} = ? ${base}`}>
      <input
        className={inputClass}
        style={inputStyle}
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const parsed = parseAmount(draft);
          if (parsed && parsed > 0) onSave(parsed);
          else setDraft(String(value));
        }}
      />
    </Field>
  );
}
