"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { THEMES, THEME_AUTO_HINT } from "@/lib/look";
import { TEXT_SCALES } from "@/lib/textScale";
import { createClient } from "@/lib/supabase/client";
import { disablePush } from "@/lib/pushClient";
import { useFood } from "@/components/food/DataProvider";
import { FoodHeader } from "@/components/food/Shell";
import { SettingsHeading } from "@/components/SettingsHeading";
import { AccountCard } from "@/components/AccountCard";
import { SignInMethods } from "@/components/SignInMethods";
import { SupportRow } from "@/components/SupportRow";
import { ReviewRow } from "@/components/ReviewRow";
import { PrivacyLink, TermsLink } from "@/components/PrivacyLink";
import { HomeLink } from "@/components/HomeLink";
import { AdminLink } from "@/components/AdminLink";
import { DeleteAccount } from "@/components/DeleteAccount";
import { Switch } from "@/components/ui";
import { WaterSettings } from "@/components/food/Water";
import { PushSettings } from "@/components/PushSettings";
import { canCompute, normFor } from "@/lib/food/norms";
import { ACTIVITIES, GOALS, type FoodSettings } from "@/lib/food/types";

const fieldStyle = { background: "var(--surface-2)", borderColor: "var(--border)" } as const;

/** Число из поля: пусто или чушь — null. */
const parse = (s: string, min: number, max: number) => {
  const n = Number(s.replace(",", "."));
  return s.trim() && Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export default function FoodSettingsPage() {
  const router = useRouter();
  const { profile, settings, saveSettings, saveProfile } = useFood();
  const s: FoodSettings | null = settings;
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [year, setYear] = useState("");
  const [own, setOwn] = useState("");
  useEffect(() => {
    setHeight(s?.height_cm ? String(s.height_cm) : "");
    setWeight(s?.weight_kg ? String(s.weight_kg) : "");
    setYear(s?.birth_year ? String(s.birth_year) : "");
    setOwn(s?.kcal_target ? String(s.kcal_target) : "");
    // Только при первой загрузке: дальше поля ведёт человек.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings === null]);

  const norm = normFor(s);
  const auto = normFor(s ? { ...s, kcal_target: null } : null);
  const manual = !!s?.kcal_target;

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <FoodHeader title="Настройки" sub="Yumdots" />

      <SettingsHeading hint="По этим данным считается норма калорий и БЖУ. Видны только вам">Ваша норма</SettingsHeading>
      <div className="food-card mb-4 rounded-3xl p-4">
        <p className="mb-1.5 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
          Пол
        </p>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {(
            [
              ["female", "Женский"],
              ["male", "Мужской"],
            ] as const
          ).map(([id, label]) => (
            <Choice key={id} on={s?.sex === id} onClick={() => void saveSettings({ sex: id })}>
              {label}
            </Choice>
          ))}
        </div>
        <div className="mb-3 grid grid-cols-3 gap-2">
          <Num label="Рост, см" value={height} set={setHeight} onDone={() => void saveSettings({ height_cm: parse(height, 80, 260) })} />
          <Num label="Вес, кг" value={weight} set={setWeight} onDone={() => void saveSettings({ weight_kg: parse(weight, 20, 400) })} />
          <Num label="Год рождения" value={year} set={setYear} onDone={() => void saveSettings({ birth_year: parse(year, 1900, new Date().getFullYear()) })} />
        </div>

        <p className="mb-1.5 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
          Активность
        </p>
        <div className="mb-3 space-y-1.5">
          {ACTIVITIES.map((a) => (
            <button
              key={a.id}
              onClick={() => void saveSettings({ activity: a.id })}
              className="flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-left transition active:scale-[0.99]"
              style={{ background: "var(--surface-2)", outline: (s?.activity ?? "light") === a.id ? "2px solid var(--accent)" : "none" }}
            >
              <span>
                <span className="block text-[0.875rem] font-medium">{a.label}</span>
                <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                  {a.hint}
                </span>
              </span>
            </button>
          ))}
        </div>

        <p className="mb-1.5 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
          Цель
        </p>
        <div className="grid grid-cols-3 gap-2">
          {GOALS.map((g) => (
            <Choice key={g.id} on={(s?.goal ?? "keep") === g.id} onClick={() => void saveSettings({ goal: g.id })}>
              <span className="block text-lg">{g.emoji}</span>
              {g.label}
            </Choice>
          ))}
        </div>
      </div>

      <div className="food-card mb-4 rounded-3xl p-4">
        {norm ? (
          <>
            <p className="text-[0.8125rem]" style={{ color: "var(--muted)" }}>
              {manual ? "Ваша норма на день" : "Норма на день по вашим данным"}
            </p>
            <p className="mt-0.5 text-[2rem] font-bold tabular-nums" style={{ color: "var(--accent)" }}>
              {norm.kcal.toLocaleString("ru-RU")} <span className="text-base font-semibold">ккал</span>
            </p>
            <p className="text-[0.8125rem] tabular-nums">
              Белки {norm.protein} г · Жиры {norm.fat} г · Углеводы {norm.carbs} г
            </p>
          </>
        ) : (
          <p className="text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
            {canCompute(s) ? "" : "Заполните пол, рост, вес и год рождения, и здесь появится норма"}
          </p>
        )}
        <div className="mt-3 flex items-center gap-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <span className="flex-1">
            <span className="block text-[0.875rem] font-medium">Своя норма</span>
            <span className="block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
              Если врач или тренер назвал свою цифру
            </span>
          </span>
          <Switch
            checked={manual}
            label="Своя норма"
            onChange={(v) => {
              if (!v) {
                setOwn("");
                void saveSettings({ kcal_target: null });
              } else {
                const start = auto?.kcal ?? 2000;
                setOwn(String(start));
                void saveSettings({ kcal_target: start });
              }
            }}
          />
        </div>
        {manual ? (
          <div className="mt-2.5">
            <Num label="Калорий в день" value={own} set={setOwn} onDone={() => { const v = parse(own, 500, 10000); if (v) void saveSettings({ kcal_target: Math.round(v) }); }} />
          </div>
        ) : null}
        <p className="mt-3 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
          Это ориентир по формуле Миффлина — Сан Жеора, а не назначение врача. При болезнях, беременности и для детей норму лучше обсудить со специалистом.
        </p>
      </div>

      <WaterSettings />

      <SettingsHeading>Уведомления</SettingsHeading>
      <PushSettings />

      <SettingsHeading>Профиль</SettingsHeading>
      <Group>
        <AccountCard name={profile?.display_name} hint="Записи о еде видны только вам" onSaveName={(display_name) => saveProfile({ display_name })} />
        <SignInMethods />
      </Group>

      <SettingsHeading hint={THEME_AUTO_HINT}>Оформление</SettingsHeading>
      <div className="mb-4 space-y-3 rounded-2xl p-4" style={{ background: "var(--surface)" }}>
        <div className="flex gap-2">
          {THEMES.map(({ id, label }) => (
            <Choice key={id} on={profile?.theme === id} onClick={() => void saveProfile({ theme: id })}>
              {label}
            </Choice>
          ))}
        </div>
        <div className="flex gap-2">
          {TEXT_SCALES.map((item) => (
            <Choice key={item.id} on={(profile?.text_scale ?? "medium") === item.id} onClick={() => void saveProfile({ text_scale: item.id })}>
              <span style={{ fontSize: `${0.875 * item.factor}rem` }}>{item.label}</span>
            </Choice>
          ))}
        </div>
      </div>

      <SettingsHeading>Помощь</SettingsHeading>
      <Group>
        <PrivacyLink from="/food/settings" />
        <TermsLink from="/food/settings" />
      </Group>
      <SupportRow />
      <ReviewRow app="food" />

      <SettingsHeading>Приложения</SettingsHeading>
      <HomeLink />
      <AdminLink />

      <Group>
        <button
          onClick={async () => {
            await disablePush().catch(() => undefined);
            await createClient().auth.signOut();
            router.replace("/login");
          }}
          className="w-full px-4 py-3.5 text-left text-[0.9375rem]"
          style={{ color: "var(--danger)" }}
        >
          Выйти
        </button>
        <DeleteAccount />
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

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="min-w-0 flex-1 rounded-2xl border px-2 py-2.5 text-[0.875rem] font-medium transition active:scale-[0.98]"
      style={{ borderColor: on ? "var(--accent)" : "var(--border)", background: on ? "var(--surface-2)" : "transparent" }}
    >
      {children}
    </button>
  );
}

function Num({ label, value, set, onDone }: { label: string; value: string; set: (v: string) => void; onDone: () => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <input
        inputMode="decimal"
        className="w-full rounded-2xl border px-3 py-2.5 text-[0.9375rem] tabular-nums outline-none focus:border-[var(--accent)]"
        style={fieldStyle}
        value={value}
        onChange={(e) => set(e.target.value)}
        onBlur={onDone}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}
