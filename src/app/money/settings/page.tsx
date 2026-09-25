"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AI_MODELS, type AiModel } from "@/lib/aiModels";
import { TEXT_SCALES } from "@/lib/textScale";
import { THEMES, THEME_AUTO_HINT } from "@/lib/look";
import { CURRENT_BUILD, applyUpdate, buildMoment, serverBuild } from "@/lib/update";
import { Icon } from "@/lib/icons";
import { CURRENCIES, parseAmount, symbolOf } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/components/DataProvider";
import { DataTransfer } from "@/components/DataTransfer";
import { StatementImport } from "@/components/StatementImport";
import { Guide } from "@/components/Guide";
import { SignInMethods } from "@/components/SignInMethods";
import { UserNumber } from "@/components/UserNumber";
import { AppSwitch } from "@/components/AppSwitch";
import { AdminLink } from "@/components/AdminLink";
import { Button, Field, Sheet, inputClass, inputStyle } from "@/components/ui";

export default function SettingsPage() {
  const router = useRouter();
  const { profile, rates, aiKeyHint, saveProfile, saveRate, saveAiKey, deleteAiKey } = useStore();
  const [sheet, setSheet] =
    useState<"currency" | "rates" | "theme" | "size" | "model" | "key" | null>(null);
  const [model, setModel] = useState(profile?.ai_model ?? AI_MODELS[0].id);
  const [keyDraft, setKeyDraft] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyProblem, setKeyProblem] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);
  // Список моделей берём у OpenRouter живьём: зашитый в код протухает, и
  // выбранная когда-то модель однажды просто исчезает.
  const [models, setModels] = useState<AiModel[]>(AI_MODELS);
  const [modelsNote, setModelsNote] = useState<string | null>(null);
  const [modelQuery, setModelQuery] = useState("");

  useEffect(() => {
    if (sheet !== "model" || models !== AI_MODELS) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/models");
        const data = (await res.json()) as { models?: AiModel[] };
        if (!alive) return;
        if (data.models?.length) setModels(data.models);
        else setModelsNote("Список не загрузился — показан запасной");
      } catch {
        if (alive) setModelsNote("Список не загрузился — показан запасной");
      }
    })();
    return () => {
      alive = false;
    };
  }, [sheet, models]);
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

  const base = profile?.base_currency ?? "KZT";
  // Бесплатные вперёд: ради них человек и заводит свой ключ.
  const needle = modelQuery.trim().toLowerCase();
  const shown = models
    .filter((m) => !needle || m.id.toLowerCase().includes(needle) || m.label.toLowerCase().includes(needle))
    .slice(0, 60);
  const modelLabel = models.find((m) => m.id === profile?.ai_model)?.label ?? profile?.ai_model;

  const signOut = async () => {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32">
      <h1 className="py-2 text-[1.625rem] font-semibold">Настройки</h1>

      <AppSwitch from="money" />
      <AdminLink />

      <Group>
        <Row
          label="Как пользоваться"
          hint="Та же инструкция, что после регистрации — можно открыть в любой момент"
          onClick={() => setGuide(true)}
        />
      </Group>

      <Group>
        <Row
          label="Аккаунт"
          value={profile?.display_name ?? undefined}
          hint="Данные привязаны к этой учётной записи и видны только вам"
        />
        <UserNumber />
        <SignInMethods />
        <Row
          label="Основная валюта"
          value={`${symbolOf(base)} ${base}`}
          onClick={() => setSheet("currency")}
        />
        <Row
          label="Курсы валют"
          hint="Задаются вручную — автоподгрузки курсов нет"
          onClick={() => setSheet("rates")}
        />
        <Row
          label="Тема"
          value={THEMES.find((item) => item.id === profile?.theme)?.label ?? "Светлая"}
          onClick={() => setSheet("theme")}
        />
        <Row
          label="Размер шрифта"
          value={TEXT_SCALES.find((item) => item.id === profile?.text_scale)?.label ?? "Средний"}
          hint="Если цифры трудно разглядеть"
          onClick={() => setSheet("size")}
        />
      </Group>

      <Group>
        <Row
          label="Ключ OpenRouter"
          value={aiKeyHint ? `···${aiKeyHint}` : "не задан"}
          hint="Разбор бюджета идёт от вашего аккаунта — ключ у каждого свой"
          onClick={() => {
            setKeyDraft("");
            setKeyProblem(null);
            setSheet("key");
          }}
        />
        <Row
          label="Модель для разбора бюджета"
          value={modelLabel}
          hint="Через OpenRouter, есть бесплатные"
          onClick={() => setSheet("model")}
        />
      </Group>

      <h2 className="mb-1.5 mt-5 px-1 text-[0.9375rem] font-semibold">Данные</h2>
      <p className="mb-2 px-1 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        Выписка из банка, перенос из другой программы и резервная копия.
        Выписка читается на устройстве и никуда не отправляется.
      </p>
      <StatementImport />
      <DataTransfer />

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
        <Row label="Выйти" danger onClick={signOut} />
      </Group>

      <button
        onClick={() => setGuide(true)}
        className="mt-5 w-full text-center text-[0.6875rem] underline"
        style={{ color: "var(--muted)" }}
      >
        Кошельки и категории правятся на «Панели»: тап по кошельку, долгое
        нажатие на категории расхода, «Настроить категорию» в окне дохода.
        Подробнее — в инструкции.
      </button>

      <Guide open={guide} onClose={() => setGuide(false)} />

      <Sheet open={sheet === "currency"} title="Основная валюта" onClose={() => setSheet(null)}>
        <div className="flex gap-2 pb-2">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              onClick={() => {
                void saveProfile({ base_currency: c.code });
                setSheet(null);
              }}
              className="flex-1 rounded-2xl px-3 py-3 text-sm"
              style={{
                background: base === c.code ? "var(--accent)" : "var(--surface-2)",
                color: base === c.code ? "#fff" : "inherit",
              }}
            >
              {c.symbol} {c.code}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === "rates"} title="Курсы валют" onClose={() => setSheet(null)}>
        <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
          Сколько {base} стоит одна единица валюты.
        </p>
        {CURRENCIES.filter((c) => c.code !== base).map((c) => (
          <RateRow
            key={c.code}
            code={c.code}
            base={base}
            value={rates.find((r) => r.code === c.code)?.rate_to_base ?? 1}
            onSave={(v) => saveRate(c.code, v)}
          />
        ))}
      </Sheet>

      <Sheet open={sheet === "theme"} title="Тема" onClose={() => setSheet(null)}>
        <div className="flex gap-2">
          {THEMES.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => {
                void saveProfile({ theme: id });
                setSheet(null);
              }}
              className="flex-1 rounded-2xl px-3 py-3 text-sm"
              style={{
                background: profile?.theme === id ? "var(--accent)" : "var(--surface-2)",
                color: profile?.theme === id ? "#fff" : "inherit",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="pb-2 pt-3 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
          {THEME_AUTO_HINT}
        </p>
      </Sheet>

      <Sheet open={sheet === "size"} title="Размер шрифта" onClose={() => setSheet(null)}>
        <div className="space-y-2 pb-2">
          {TEXT_SCALES.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                void saveProfile({ text_scale: item.id });
                setSheet(null);
              }}
              className="flex w-full items-baseline gap-2 rounded-2xl px-4 py-3.5 text-left"
              style={{
                background:
                  (profile?.text_scale ?? "medium") === item.id ? "var(--accent)" : "var(--surface-2)",
                color: (profile?.text_scale ?? "medium") === item.id ? "#fff" : "inherit",
              }}
            >
              {/* Размер названия показывает сам результат выбора */}
              <span
                className="font-semibold"
                style={{ fontSize: `${item.factor}rem` }}
              >
                {item.label}
              </span>
              <span className="text-[0.6875rem] opacity-70">{item.hint}</span>
            </button>
          ))}
        </div>
        <p className="pb-2 text-xs" style={{ color: "var(--muted)" }}>
          Меняется весь текст в приложении, а на крупном размере кружки на
          «Панели» становятся больше и встают по четыре в ряд вместо пяти.
        </p>
      </Sheet>

      <Sheet
        open={sheet === "key"}
        title="Ключ OpenRouter"
        onClose={() => setSheet(null)}
        footer={
          <div className="space-y-2">
            <Button
              disabled={keyBusy || keyDraft.trim().length < 8}
              onClick={async () => {
                setKeyBusy(true);
                setKeyProblem(null);
                try {
                  await saveAiKey(keyDraft);
                  setSheet(null);
                } catch (e) {
                  setKeyProblem(e instanceof Error ? e.message : "Не получилось сохранить");
                } finally {
                  setKeyBusy(false);
                }
              }}
            >
              {keyBusy ? "Сохраняю…" : "Сохранить ключ"}
            </Button>
            {aiKeyHint ? (
              <Button
                variant="ghost"
                disabled={keyBusy}
                onClick={async () => {
                  setKeyBusy(true);
                  try {
                    await deleteAiKey();
                    setSheet(null);
                  } finally {
                    setKeyBusy(false);
                  }
                }}
              >
                Удалить ключ
              </Button>
            ) : null}
          </div>
        }
      >
        <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
          Разбор бюджета выполняется вашим ключом, поэтому и расходы ваши.
          Бесплатных моделей в списке хватает — на них счёт не растёт.
        </p>
        <ol className="mb-4 space-y-1.5 text-sm" style={{ color: "var(--muted)" }}>
          <li>
            1. Заведите ключ на{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
              style={{ color: "var(--accent)" }}
            >
              openrouter.ai/keys
            </a>
          </li>
          <li>2. Вставьте его сюда — он начинается с sk-or-</li>
        </ol>

        <Field
          label={aiKeyHint ? `Новый ключ (сейчас задан ···${aiKeyHint})` : "Ключ"}
          hint="Хранится в вашей строке базы, другим пользователям он недоступен. В браузер обратно не отдаётся — показываются только последние 4 символа."
        >
          <input
            type="password"
            autoComplete="off"
            className={inputClass}
            style={inputStyle}
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="sk-or-..."
          />
        </Field>

        {keyProblem ? (
          <p className="pb-2 text-sm" style={{ color: "var(--danger)" }}>
            {keyProblem}
          </p>
        ) : null}
      </Sheet>

      <Sheet
        open={sheet === "model"}
        title="Модель"
        onClose={() => setSheet(null)}
        footer={
          <Button
            onClick={() => {
              void saveProfile({ ai_model: model });
              setSheet(null);
            }}
          >
            Сохранить
          </Button>
        }
      >
        {modelsNote ? (
          <p className="mb-2 text-xs" style={{ color: "var(--muted)" }}>
            {modelsNote}
          </p>
        ) : null}

        <input
          className={`${inputClass} mb-2`}
          style={inputStyle}
          value={modelQuery}
          onChange={(e) => setModelQuery(e.target.value)}
          placeholder="Поиск: gemma, claude, qwen…"
        />

        <p className="mb-2 px-1 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
          Модели с меткой «думает» сначала пишут черновик и только потом ответ —
          разбор у них выходит вдумчивее, но ждать дольше.
        </p>

        <div className="mb-3 max-h-[46vh] space-y-2 overflow-y-auto">
          {shown.map((m) => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm"
              style={{
                background: model === m.id ? "var(--accent)" : "var(--surface-2)",
                color: model === m.id ? "#fff" : "inherit",
              }}
            >
              <span className="flex-1">{m.label}</span>
              {m.thinks ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[0.625rem] font-semibold"
                  style={{
                    background: model === m.id ? "rgba(255,255,255,0.25)" : "var(--surface)",
                    color: model === m.id ? "#fff" : "var(--muted)",
                  }}
                >
                  думает
                </span>
              ) : null}
              {m.free ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[0.625rem] font-semibold"
                  style={{
                    background: model === m.id ? "rgba(255,255,255,0.25)" : "var(--ok)",
                    color: "#fff",
                  }}
                >
                  free
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <Field
          label="Или вписать идентификатор вручную"
          hint="Список берётся у OpenRouter — если нужной модели в нём нет, впишите её сюда"
        >
          <input
            className={inputClass}
            style={inputStyle}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </Field>
      </Sheet>
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
        <span className="block text-[0.9375rem]" style={{ color: danger ? "var(--danger)" : undefined }}>
          {label}
        </span>
        {hint ? (
          <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
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
      {onClick && !danger ? (
        <Icon name="chevron-right" size={16} className="opacity-30" />
      ) : null}
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
