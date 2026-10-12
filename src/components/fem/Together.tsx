"use client";

import { useEffect, useState } from "react";
import { today } from "@/lib/tasks/dates";
import { FEM_GRADIENT } from "@/lib/fem/cycle";
import { BUY_ITEMS, STATUSES, ago, signalText, statusOf } from "@/lib/fem/together";
import { Sheet } from "@/components/ui";
import { useFem, type FemSignal, type SignalKind } from "./DataProvider";

const DAY = 86_400_000;
const fresh = (s: FemSignal, ms = DAY) => Date.now() - Date.parse(s.created_at) < ms;

/** Отправить сигнал и коротко показать «Отправлено» или ошибку. */
function useSend() {
  const { sendSignal } = useFem();
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 3500);
    return () => clearTimeout(t);
  }, [note]);
  const send = async (kind: SignalKind, item: string | undefined, done: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await sendSignal(kind, item);
      setNote({ text: done });
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : "Не получилось отправить", bad: true });
    }
    setBusy(false);
  };
  return { send, note, busy };
}

function Note({ note }: { note: { text: string; bad?: boolean } | null }) {
  if (!note) return null;
  return (
    <p className="animate-lift mt-2 text-center text-[0.75rem]" style={{ color: note.bad ? "var(--danger)" : "var(--accent)" }}>
      {note.text}
    </p>
  );
}

/**
 * Её карточка «Вместе»: статус дня для партнёра, просьбы одним нажатием
 * и то, что он ответил. Видна, только когда партнёр подключён.
 */
export function OwnTogether() {
  const { share, signals, userId, days, saveDay, markSignalsSeen } = useFem();
  const [buy, setBuy] = useState(false);
  const { send, note, busy } = useSend();
  const now = today();
  const name = share?.partner_name;
  const incoming = signals.filter((s) => s.to_id === userId && fresh(s)).slice(0, 3);
  const status = days.get(now)?.status ?? null;

  useEffect(() => {
    if (incoming.some((s) => !s.seen_at)) void markSignalsSeen();
  }, [incoming, markSignalsSeen]);

  if (!name) return null;

  return (
    <div className="fem-card mt-3 rounded-3xl p-4">
      <p className="text-[0.9375rem] font-semibold">Вы и {name}</p>

      {incoming.length ? (
        <div className="mt-2.5 space-y-1.5">
          {incoming.map((s) => {
            const t = signalText(s.kind, s.item);
            return (
              <div key={s.id} className="flex items-center gap-2.5 rounded-2xl px-3 py-2" style={{ background: "var(--surface-2)" }}>
                <span className="text-lg">{t.emoji}</span>
                <span className="min-w-0 flex-1 text-sm">
                  <b>{name}:</b> {t.text}
                </span>
                <span className="shrink-0 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                  {ago(s.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="mb-1.5 mt-3 text-xs font-semibold" style={{ color: "var(--muted)" }}>
        Статус на сегодня — {name} увидит его
      </p>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STATUSES.map((st) => {
          const on = status === st.value;
          return (
            <button
              key={st.value}
              onClick={() => void saveDay(now, { status: on ? null : st.value })}
              aria-pressed={on}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] transition active:scale-95"
              style={{
                background: on ? FEM_GRADIENT : "var(--surface-2)",
                color: on ? "#fff" : "var(--text)",
              }}
            >
              <span>{st.emoji}</span>
              {st.label}
            </button>
          );
        })}
      </div>

      <p className="mb-1.5 mt-3 text-xs font-semibold" style={{ color: "var(--muted)" }}>
        Попросить одним нажатием
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Ask emoji="💗" label="Нужна забота" disabled={busy} onClick={() => void send("care", undefined, `Отправлено ${name} 💗`)} />
        <Ask emoji="🛍" label="Купи по дороге" disabled={busy} onClick={() => setBuy(true)} />
        <Ask emoji="🌙" label="Побыть одной" disabled={busy} onClick={() => void send("alone", undefined, `${name} узнает, что вам нужно время`)} />
      </div>
      <Note note={note} />

      <Sheet open={buy} title="Что купить?" onClose={() => setBuy(false)}>
        <div className="grid grid-cols-2 gap-2 pb-3">
          {BUY_ITEMS.map((it) => (
            <button
              key={it.value}
              onClick={() => {
                setBuy(false);
                void send("buy", it.value, `${name} получил просьбу: ${it.label.toLowerCase()}`);
              }}
              className="flex items-center gap-2.5 rounded-2xl px-3.5 py-3 text-left text-sm transition active:scale-95"
              style={{ background: "var(--surface-2)" }}
            >
              <span className="text-xl">{it.emoji}</span>
              {it.label}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function Ask({ emoji, label, onClick, disabled }: { emoji: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 rounded-2xl px-1 py-3 text-center text-[0.75rem] font-medium leading-tight transition active:scale-95 disabled:opacity-60"
      style={{ background: "var(--surface-2)" }}
    >
      <span className="text-xl">{emoji}</span>
      {label}
    </button>
  );
}

/**
 * Сторона партнёра: её просьбы с кнопкой «Уже бегу», её статус дня и
 * «Думаю о тебе ❤️».
 */
export function PartnerTogether({ name, status }: { name: string; status: string | null }) {
  const { signals, userId, markSignalsSeen } = useFem();
  const { send, note, busy } = useSend();
  const asks = signals.filter((s) => s.to_id === userId && fresh(s) && s.kind !== "heart" && s.kind !== "ok").slice(0, 3);
  // Ответил ли уже на просьбу — «ok» после неё.
  const answered = (s: FemSignal) =>
    signals.some((x) => x.from_id === userId && x.kind === "ok" && Date.parse(x.created_at) > Date.parse(s.created_at));
  const st = statusOf(status);

  useEffect(() => {
    if (asks.some((s) => !s.seen_at)) void markSignalsSeen();
  }, [asks, markSignalsSeen]);

  return (
    <div className="mb-4 space-y-2.5">
      {asks.map((s) => {
        const t = signalText(s.kind, s.item);
        const done = answered(s);
        return (
          <div key={s.id} className="fem-card animate-lift flex items-center gap-3 rounded-3xl px-4 py-3">
            <span className="text-2xl">{t.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem] font-semibold leading-snug">{t.text}</span>
              <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                {name} · {ago(s.created_at)}
              </span>
            </span>
            {s.kind !== "alone" ? (
              <button
                onClick={() => void send("ok", undefined, `${name} знает, что вы уже бежите`)}
                disabled={busy || done}
                className="shrink-0 rounded-full px-3 py-2 text-[0.8125rem] font-semibold text-white disabled:opacity-60"
                style={{ background: done ? "var(--muted)" : FEM_GRADIENT }}
              >
                {done ? "Ответили ✓" : "Уже бегу 🏃"}
              </button>
            ) : null}
          </div>
        );
      })}

      {st ? (
        <div className="fem-card flex items-center gap-3 rounded-3xl px-4 py-3">
          <span className="text-2xl">{st.emoji}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              {name} сегодня
            </span>
            <span className="block text-[0.9375rem] font-semibold">{st.label}</span>
          </span>
        </div>
      ) : null}

      <button
        onClick={() => void send("heart", undefined, `${name} получит ваше «Думаю о тебе» ❤️`)}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-3xl py-3.5 text-[0.9375rem] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
        style={{ background: FEM_GRADIENT, boxShadow: "0 12px 26px -12px rgba(236,72,153,0.75)" }}
      >
        ❤️ Думаю о тебе
      </button>
      <Note note={note} />
    </div>
  );
}
