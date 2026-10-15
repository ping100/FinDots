"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, today } from "@/lib/tasks/dates";
import { FEM_GRADIENT, PHASE_COLOR, SHARED_KINDS, buildMarks, type CycleInfo, type FemPeriod } from "@/lib/fem/cycle";
import {
  ERRANDS,
  INVITE_IDEAS,
  LIKES,
  ago,
  packInvite,
  signalText,
  unpackInvite,
  whenText,
  type Likes,
  type ReplyPreset,
} from "@/lib/fem/together";
import type { FemSignal } from "./DataProvider";

/**
 * Части карточки «Вместе»: ответ в одно нажатие (три готовых + своё),
 * ход отправленной просьбы, приглашение на вечер, отметка близости и
 * «Что она любит».
 */

// ───────────────────────────── ответ ─────────────────────────────

/** Три готовых ответа и «✏️ Своё» — поле для пары слов. */
export function ReplyBox({
  presets,
  busy,
  inset,
  onSend,
}: {
  presets: ReplyPreset[];
  busy?: boolean;
  /** Карточка уже серая (surface-2) — кнопки делаем белыми, иначе сливаются. */
  inset?: boolean;
  onSend: (text: string, done: boolean) => void;
}) {
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t, false);
    setText("");
    setWriting(false);
  };
  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.act}
            onClick={() => onSend(p.text, !!p.done)}
            disabled={busy}
            className="rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition active:scale-95 disabled:opacity-60"
            style={{
              background: p.done ? "#14b8a6" : inset ? "var(--surface)" : "var(--surface-2)",
              color: p.done ? "#fff" : "var(--text)",
              boxShadow: inset && !p.done ? "0 1px 2px rgba(0,0,0,.06)" : undefined,
            }}
          >
            {p.text}
          </button>
        ))}
        <button
          onClick={() => setWriting((v) => !v)}
          aria-expanded={writing}
          className="rounded-full border border-dashed px-3 py-1.5 text-[0.8125rem] font-medium transition active:scale-95"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          ✏️ Своё
        </button>
      </div>
      {writing ? (
        <div className="animate-lift mt-2 flex gap-2">
          <input
            autoFocus
            value={text}
            maxLength={120}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Напишите пару слов"
            className="min-w-0 flex-1 rounded-2xl border px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-[var(--accent)]"
            style={{ background: inset ? "var(--surface)" : "var(--surface-2)", borderColor: "var(--border)" }}
          />
          <button
            onClick={send}
            disabled={!text.trim() || busy}
            aria-label="Отправить"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg text-white transition active:scale-95 disabled:opacity-50"
            style={{ background: FEM_GRADIENT }}
          >
            ➤
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ───────────────────────────── ход просьбы ─────────────────────────────

/** Ответы на сигнал: слова и «готово». Старое «ok» без ссылки — тоже ответ. */
export function repliesTo(signals: FemSignal[], s: FemSignal): { reply: FemSignal | null; done: FemSignal | null } {
  const key = `${s.kind}:${s.item ?? ""}`;
  const after = (x: FemSignal) => Date.parse(x.created_at) >= Date.parse(s.created_at);
  const list = signals.filter(
    (x) =>
      x.from_id === s.to_id &&
      (x.reply_to === s.id || (x.kind === "ok" && !x.reply_to && (!x.item || x.item === key) && after(x))),
  );
  // Новые сверху — берём последний ответ словами и отметку «готово».
  return {
    reply: list.find((x) => x.kind === "reply" || x.kind === "ok") ?? null,
    done: list.find((x) => x.kind === "done") ?? null,
  };
}

const SENT_KEY = "fem.sent.hidden";
const SENT_LIFE = 12 * 3_600_000;

function readHidden(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Что я отправил(а) и как оно идёт: отправлено → увидел → бежит → готово,
 * и что ответили. she — получатель «она» (для подписей «увидела»).
 */
export function SentList({
  signals,
  userId,
  name,
  she,
  title,
}: {
  signals: FemSignal[];
  userId: string | null;
  name: string;
  she: boolean;
  title: string;
}) {
  const [hidden, setHidden] = useState<number[]>([]);
  useEffect(() => setHidden(readHidden()), []);
  const hide = (id: number) => {
    const next = [...hidden, id].slice(-100);
    setHidden(next);
    try {
      localStorage.setItem(SENT_KEY, JSON.stringify(next));
    } catch {
      // Не запомнили — после перезахода карточка вернётся.
    }
  };

  const items = signals
    .filter((s) => s.from_id === userId && Date.now() - Date.parse(s.created_at) < SENT_LIFE && !hidden.includes(s.id))
    .map((s) => ({ s, ...repliesTo(signals, s) }))
    // Сердечко и «позабочусь» — только когда на них ответили.
    .filter(({ s, reply }) => ERRANDS.has(s.kind) || s.kind === "alone" || s.kind === "invite" || ((s.kind === "heart" || s.kind === "will") && reply))
    // Выполненное висит ещё 3 часа и уходит само.
    .filter(({ done }) => !done || Date.now() - Date.parse(done.created_at) < 3 * 3_600_000)
    .slice(0, 4);
  if (!items.length) return null;

  const seenWord = she ? "Увидела" : "Увидел";
  const answerWord = she ? "Ответила" : "Ответил";

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-semibold" style={{ color: "var(--muted)" }}>
        {title}
      </p>
      <div className="space-y-1.5">
        {items.map(({ s, reply, done }) => {
          const t = signalText(s.kind, s.item);
          const inv = s.kind === "invite" ? unpackInvite(s.item) : null;
          const steps = ERRANDS.has(s.kind)
            ? ["Отправлено", seenWord, she ? "Отвечает" : "Бежит", "Готово"]
            : s.kind === "heart" || s.kind === "will"
              ? null
              : ["Отправлено", seenWord, answerWord];
          const at = done ? 3 : reply ? 2 : s.seen_at ? 1 : 0;
          return (
            <div key={s.id} className="animate-lift rounded-2xl py-2.5 pl-3 pr-2" style={{ background: "var(--surface-2)" }}>
              <div className="flex items-center gap-2">
                <span className="text-base">{t.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">
                  {inv ? `${inv.emoji} ${inv.label}, ${whenText(inv.day, inv.time, today())}` : s.kind === "heart" ? "Думаю о тебе" : t.text}
                </span>
                <span className="shrink-0 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                  {ago(s.created_at)}
                </span>
                <button
                  onClick={() => hide(s.id)}
                  aria-label="Скрыть"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[1rem] leading-none"
                  style={{ color: "var(--muted)" }}
                >
                  ×
                </button>
              </div>
              {steps ? <Steps steps={steps} at={Math.min(at, steps.length - 1)} /> : null}
              {reply || done ? (
                <p className="mt-1.5 text-[0.8125rem] leading-snug">
                  <span style={{ color: "var(--muted)" }}>{name}:</span> {(done ?? reply)!.item ?? "Уже бегу! 🏃"}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Steps({ steps, at }: { steps: string[]; at: number }) {
  return (
    <div className="mt-2 flex items-center pr-1" aria-label={`Сейчас: ${steps[at]}`}>
      {steps.map((label, i) => (
        <div key={label} className={`flex items-center ${i ? "flex-1" : ""}`}>
          {i ? (
            <span className="mx-1 h-[2px] flex-1 rounded-full" style={{ background: i <= at ? "#14b8a6" : "var(--border)" }} />
          ) : null}
          <span className="flex items-center gap-1 whitespace-nowrap text-[0.6875rem]" style={{ color: i <= at ? "var(--text)" : "var(--muted)" }}>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: i <= at ? "#14b8a6" : "var(--border)", boxShadow: i === at ? "0 0 0 3px rgba(20,184,166,.25)" : undefined }}
            />
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────── приглашение ─────────────────────────────

const TIMES = ["18:00", "19:00", "20:00", "21:00"];
const SHORT_WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/** Партнёр зовёт её на вечер: что, когда — с подсказкой по её дням. */
export function InviteForm({
  name,
  info,
  periods,
  onSend,
}: {
  name: string;
  info: CycleInfo | null;
  periods: FemPeriod[];
  onSend: (item: string) => void;
}) {
  const now = today();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(now, i)), [now]);
  const marks = useMemo(() => (info ? buildMarks(periods, info, now) : null), [info, periods, now]);
  const [idea, setIdea] = useState<{ emoji: string; label: string } | null>(INVITE_IDEAS[0]);
  const [own, setOwn] = useState("");
  const [day, setDay] = useState(now);
  const [time, setTime] = useState<string | null>("19:00");

  const m = marks?.get(day);
  // Месячные в ближайшие 2 дня после выбранного — значит, сейчас её «перед».
  const beforePeriod = !m?.period && !m?.predicted && [1, 2].some((k) => {
    const x = marks?.get(addDays(day, k));
    return x?.period || x?.predicted;
  });
  const hint = m?.period || m?.predicted
    ? "В этот день, скорее всего, месячные — лучше что-то уютное: кино, вечер дома, вкусный ужин"
    : beforePeriod
      ? "Перед месячными сил меньше — без долгих прогулок и шумных мест"
      : m?.fertile || m?.ovulation
        ? "У неё сейчас обычно больше сил и настроения — хорошее время для чего-то нового"
        : null;
  const color = (d: string) => {
    const x = marks?.get(d);
    return x?.period || x?.predicted ? PHASE_COLOR.period : x?.fertile || x?.ovulation ? PHASE_COLOR.fertile : null;
  };

  const what = own.trim() ? { emoji: "💌", label: own.trim() } : idea;

  return (
    <div className="space-y-4 pb-3">
      <div>
        <p className="mb-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>
          Куда или что
        </p>
        <div className="grid grid-cols-3 gap-2">
          {INVITE_IDEAS.map((it) => {
            const on = !own.trim() && idea?.label === it.label;
            return (
              <button
                key={it.label}
                onClick={() => {
                  setIdea(it);
                  setOwn("");
                }}
                aria-pressed={on}
                className="flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-[0.8125rem] transition active:scale-95"
                style={{ background: on ? FEM_GRADIENT : "var(--surface-2)", color: on ? "#fff" : "var(--text)" }}
              >
                <span className="text-xl">{it.emoji}</span>
                {it.label}
              </button>
            );
          })}
        </div>
        <input
          value={own}
          maxLength={40}
          onChange={(e) => setOwn(e.target.value)}
          placeholder="✏️ Или своё: «Каток», «К родителям»…"
          className="mt-2 w-full rounded-2xl border px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-[var(--accent)]"
          style={{ background: "var(--surface-2)", borderColor: own.trim() ? "var(--accent)" : "var(--border)" }}
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>
          Когда
        </p>
        <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {days.map((d, i) => {
            const on = d === day;
            const dot = color(d);
            const date = new Date(d + "T12:00:00");
            return (
              <button
                key={d}
                onClick={() => setDay(d)}
                aria-pressed={on}
                className="flex w-14 shrink-0 flex-col items-center rounded-2xl py-2 transition active:scale-95"
                style={{ background: on ? FEM_GRADIENT : "var(--surface-2)", color: on ? "#fff" : "var(--text)" }}
              >
                <span className="text-[0.6875rem] opacity-80">{i === 0 ? "сегодня" : i === 1 ? "завтра" : SHORT_WD[date.getDay()]}</span>
                <span className="text-[1.0625rem] font-semibold tabular-nums">{date.getDate()}</span>
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ background: dot ?? "transparent" }} />
              </button>
            );
          })}
        </div>
        {hint ? (
          <p className="animate-lift mt-2 rounded-2xl px-3 py-2 text-[0.75rem] leading-snug" style={{ background: "var(--surface-2)" }}>
            💡 {hint}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...TIMES, null].map((t) => {
            const on = time === t;
            return (
              <button
                key={t ?? "any"}
                onClick={() => setTime(t)}
                aria-pressed={on}
                className="rounded-full px-3 py-1.5 text-[0.8125rem] tabular-nums transition active:scale-95"
                style={{ background: on ? FEM_GRADIENT : "var(--surface-2)", color: on ? "#fff" : "var(--text)" }}
              >
                {t ?? "Любое время"}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => what && onSend(packInvite(what.emoji, what.label, day, time))}
        disabled={!what}
        className="w-full rounded-2xl py-3.5 text-[0.9375rem] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
        style={{ background: FEM_GRADIENT }}
      >
        Позвать: {what ? `${what.emoji} ${what.label}` : "…"}, {whenText(day, time, now)}
      </button>
    </div>
  );
}

// ───────────────────────────── близость ─────────────────────────────

const INTIM_KINDS = [{ value: "sex", label: "Секс" }, ...SHARED_KINDS];

/** Партнёр отмечает близость — она подтвердит, и только тогда отметка встанет. */
export function IntimForm({ name, onSend }: { name: string; onSend: (day: string, kinds: string[], prot: boolean | null) => void }) {
  const now = today();
  const [day, setDay] = useState(now);
  const [kinds, setKinds] = useState<string[]>(["sex"]);
  const [prot, setProt] = useState<boolean | null>(null);
  const days = [
    { d: now, label: "Сегодня" },
    { d: addDays(now, -1), label: "Вчера" },
    { d: addDays(now, -2), label: "Позавчера" },
  ];
  const chip = (on: boolean) => ({ background: on ? FEM_GRADIENT : "var(--surface-2)", color: on ? "#fff" : "var(--text)" });
  return (
    <div className="space-y-4 pb-3">
      <p className="text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
        {name} получит вопрос и подтвердит отметку — только тогда она появится в её календаре и учтётся в прогнозе.
      </p>
      <div className="flex gap-1.5">
        {days.map((x) => (
          <button key={x.d} onClick={() => setDay(x.d)} className="flex-1 rounded-2xl py-2.5 text-[0.875rem] transition active:scale-95" style={chip(day === x.d)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {INTIM_KINDS.map((k) => {
          const on = kinds.includes(k.value);
          return (
            <button
              key={k.value}
              onClick={() => setKinds((prev) => (on ? prev.filter((x) => x !== k.value) : [...prev, k.value]))}
              aria-pressed={on}
              className="rounded-full px-3 py-1.5 text-[0.8125rem] transition active:scale-95"
              style={chip(on)}
            >
              {k.label}
            </button>
          );
        })}
      </div>
      {kinds.includes("sex") ? (
        <div className="flex gap-1.5">
          {[
            { v: true, label: "С защитой" },
            { v: false, label: "Без защиты" },
            { v: null, label: "Не указывать" },
          ].map((x) => (
            <button key={String(x.v)} onClick={() => setProt(x.v)} className="flex-1 rounded-2xl py-2.5 text-[0.8125rem] transition active:scale-95" style={chip(prot === x.v)}>
              {x.label}
            </button>
          ))}
        </div>
      ) : null}
      <button
        onClick={() => onSend(day, kinds, kinds.includes("sex") ? prot : null)}
        disabled={!kinds.length}
        className="w-full rounded-2xl py-3.5 text-[0.9375rem] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
        style={{ background: FEM_GRADIENT }}
      >
        Отправить на подтверждение
      </button>
    </div>
  );
}

/** «вчера · секс, с защитой» — для карточки подтверждения у неё. */
export function intimLine(x: { day: string; kinds: string[]; protected: boolean | null }, now: string): string {
  const when = x.day === now ? "сегодня" : x.day === addDays(now, -1) ? "вчера" : x.day === addDays(now, -2) ? "позавчера" : whenText(x.day, null, now);
  const what = x.kinds.map((k) => INTIM_KINDS.find((i) => i.value === k)?.label.toLowerCase() ?? k).join(", ");
  const prot = x.kinds.includes("sex") && x.protected !== null ? (x.protected ? ", с защитой" : ", без защиты") : "";
  return `${when}${what ? ` · ${what}` : ""}${prot}`;
}

// ───────────────────────────── «что она любит» ─────────────────────────────

/** Она заполняет — партнёр видит. Сохраняется по уходу с поля. */
export function LikesEditor({ name, likes, onSave }: { name: string; likes: Likes; onSave: (next: Likes) => void }) {
  const [draft, setDraft] = useState<Likes>(likes);
  const save = (key: string, value: string) => {
    const next = { ...draft, [key]: value.trim() || undefined };
    setDraft(next);
    onSave(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  };
  return (
    <div className="space-y-2.5 pb-3">
      <p className="text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
        {name} увидит это у себя — и когда вы попросите «купи по дороге», подскажем ему, что именно взять.
      </p>
      {LIKES.map((l) => (
        <label key={l.key} className="block rounded-2xl px-3.5 py-2.5" style={{ background: "var(--surface-2)" }}>
          <span className="block text-[0.75rem] font-semibold" style={{ color: "var(--muted)" }}>
            {l.emoji} {l.label}
          </span>
          <input
            defaultValue={draft[l.key] ?? ""}
            maxLength={120}
            placeholder={l.hint}
            onBlur={(e) => save(l.key, e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="mt-0.5 w-full bg-transparent text-[0.9375rem] outline-none"
          />
        </label>
      ))}
    </div>
  );
}

/** У партнёра: что она любит — свёрнуто в одну строку, раскрывается. */
export function LikesCard({ name, likes }: { name: string; likes: Likes }) {
  const [open, setOpen] = useState(false);
  const filled = LIKES.filter((l) => likes[l.key]);
  if (!filled.length) return null;
  return (
    <div className="fem-card mt-3 rounded-3xl p-4">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 text-left">
        <span className="text-lg">💝</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-semibold">Что любит {name}</span>
          {!open ? (
            <span className="block truncate text-[0.75rem]" style={{ color: "var(--muted)" }}>
              {filled.map((l) => `${l.emoji} ${likes[l.key]}`).join(" · ")}
            </span>
          ) : null}
        </span>
        <span className="text-[0.75rem]" style={{ color: "var(--muted)" }}>
          {open ? "Свернуть" : "Открыть"}
        </span>
      </button>
      {open ? (
        <div className="animate-lift mt-3 space-y-1.5">
          {filled.map((l) => (
            <div key={l.key} className="rounded-2xl px-3.5 py-2.5" style={{ background: "var(--surface-2)" }}>
              <p className="text-[0.6875rem] font-semibold" style={{ color: l.key === "no" ? "var(--danger)" : "var(--muted)" }}>
                {l.emoji} {l.label}
              </p>
              <p className="text-[0.9375rem] leading-snug">{likes[l.key]}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
