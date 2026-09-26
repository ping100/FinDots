"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { Loader } from "@/components/Loader";
import { Denied, useOverview } from "@/components/admin/shared";
import { Button, Field, inputClass, inputStyle } from "@/components/ui";
import { AI_MODELS, type AiModel } from "@/lib/aiModels";

interface Status {
  configured: boolean;
  hint: string | null;
  model: string;
  updated_at: string | null;
}

/**
 * Общий ключ OpenRouter и модель — одни на всё приложение. Раньше каждый
 * заводил свой ключ в настройках; теперь его задаёт админ здесь, и разбор
 * бюджета сразу доступен всем (кроме тех, кому доступ выключен отдельно,
 * в действиях с пользователем).
 */
export default function AdminAiPage() {
  const { denied } = useOverview();
  const [status, setStatus] = useState<Status | null | undefined>(undefined);
  const [keyDraft, setKeyDraft] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<AiModel[]>(AI_MODELS);
  const [modelsNote, setModelsNote] = useState<string | null>(null);
  const [modelQuery, setModelQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void fetch("/api/admin/ai-config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Status | null) => {
        setStatus(data);
        setModel(data?.model ?? AI_MODELS[0].id);
      });
  }, []);

  useEffect(() => {
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
  }, []);

  if (denied) return <Denied />;
  if (status === undefined) return <Loader />;

  const needle = modelQuery.trim().toLowerCase();
  const shown = models
    .filter((m) => !needle || m.id.toLowerCase().includes(needle) || m.label.toLowerCase().includes(needle))
    .slice(0, 60);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: keyDraft.trim() || undefined, model }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) throw new Error(data.error ?? "Не получилось сохранить");
      setKeyDraft("");
      setSaved(true);
      const fresh = await fetch("/api/admin/ai-config").then((r) => (r.ok ? r.json() : null));
      setStatus(fresh);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Не получилось сохранить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <header className="flex items-center gap-2 py-3">
        <Link
          href="/admin"
          aria-label="В админку"
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full"
          style={{ color: "var(--muted)" }}
        >
          <Icon name="chevron-left" size={20} />
        </Link>
        <h1 className="flex-1 text-[1.375rem] font-semibold">Нейросеть</h1>
      </header>

      <p className="mb-4 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
        Ключ OpenRouter и модель — общие для всех: разбор бюджета в
        аналитике идёт от этого ключа, и никто из людей его не видит и не
        настраивает сам. Доступ к разбору для конкретного человека
        выключается в действиях с пользователем.
      </p>

      <div className="mb-4 rounded-2xl p-3.5 text-[0.8125rem]" style={{ background: "var(--surface)" }}>
        {status?.configured ? (
          <>
            Ключ задан, оканчивается на <span className="font-medium">···{status.hint}</span>
            {status.updated_at ? (
              <span style={{ color: "var(--muted)" }}>
                {" "}
                · обновлён {new Date(status.updated_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
          </>
        ) : (
          <span style={{ color: "var(--danger)" }}>Ключ ещё не задан — разбор бюджета недоступен никому</span>
        )}
      </div>

      <Field
        label={status?.configured ? "Новый ключ (необязательно)" : "Ключ OpenRouter"}
        hint={
          status?.configured
            ? "Оставьте пустым, если меняете только модель"
            : "Заведите ключ на openrouter.ai/keys и вставьте сюда — начинается с sk-or-"
        }
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

      <p className="mb-2 mt-4 px-1 text-[0.8125rem] font-medium">Модель</p>
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

      <div className="mb-3 max-h-[40vh] space-y-2 overflow-y-auto">
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
        <input className={inputClass} style={inputStyle} value={model} onChange={(e) => setModel(e.target.value)} />
      </Field>

      {problem ? (
        <p className="mb-2 mt-3 text-sm" style={{ color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}
      {saved ? (
        <p className="mb-2 mt-3 text-sm" style={{ color: "var(--ok)" }}>
          Сохранено
        </p>
      ) : null}

      <div className="mt-3">
        <Button onClick={() => void save()} disabled={busy || !model}>
          {busy ? "Сохраняю…" : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}
