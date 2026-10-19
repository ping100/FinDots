"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { today } from "@/lib/tasks/dates";
import { FEM_GRADIENT, type CycleInfo, type FemPeriod } from "@/lib/fem/cycle";
import {
  BUY_ITEMS,
  EMOJI_CHOICES,
  ERRANDS,
  LIKE_FOR_ITEM,
  REPLIES,
  STATUSES,
  doneText,
  packCustom,
  signalText,
  statusOf,
  unpackIntim,
  unpackInvite,
  whenText,
  type Likes,
} from "@/lib/fem/together";
import { Sheet } from "@/components/ui";
import { useFem, type FemSignal, type SignalKind } from "./DataProvider";
import { burst, centerOf } from "@/lib/fem/fx";
import { InviteForm, LikesCard, LikesEditor, ReplyBox, Steps, intimLine, repliesTo } from "./TogetherParts";

/**
 * «Вместе» — переписка пары. В одной ленте всё подряд: обычные сообщения,
 * её просьбы, его ответы, «Думаю о тебе», приглашения, отметки близости.
 * На просьбу отвечают прямо в ленте (три готовых ответа или своё), внизу —
 * быстрые кнопки и поле для текста.
 */

/** Отвечать кнопками можно сутки — дальше просьба уже не про сегодня. */
const ACT_WINDOW = 24 * 3_600_000;
const recent = (s: FemSignal) => Date.now() - Date.parse(s.created_at) < ACT_WINDOW;
/** Её просьбы. */
const ASKS = new Set(["care", "buy", "alone", "custom"]);
/** Ответы — показываются со ссылкой на то, на что отвечают. */
const REPLY_KINDS = new Set(["reply", "done", "ok"]);

/** Непрочитанное от партнёра — для значка на вкладке и полоски на «Цикле». */
export function unread(signals: FemSignal[], userId: string | null) {
  return signals.filter((s) => s.to_id === userId && !s.seen_at && s.kind !== "will");
}

/** Отправить что-нибудь и коротко показать «Отправлено» или ошибку. */
function useSend() {
  const { sendSignal } = useFem();
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 3500);
    return () => clearTimeout(t);
  }, [note]);
  const run = async (action: () => Promise<void>, done?: string) => {
    if (busy) return false;
    setBusy(true);
    let ok = true;
    try {
      await action();
      if (done) setNote({ text: done });
    } catch (e) {
      ok = false;
      setNote({ text: e instanceof Error ? e.message : "Не получилось отправить", bad: true });
    }
    setBusy(false);
    return ok;
  };
  const send = (kind: SignalKind, item: string | undefined, done?: string) => run(() => sendSignal(kind, item), done);
  return { send, run, note, busy };
}

/**
 * Тонкая полоска на «Цикле»: есть непрочитанное от партнёра — последнее
 * одной строкой и «Открыть».
 */
export function TogetherStrip({
  name,
  href,
  onOpen,
  className = "mt-3",
}: {
  name: string;
  href?: string;
  onOpen?: () => void;
  className?: string;
}) {
  const { signals, userId } = useFem();
  const list = unread(signals, userId);
  if (!list.length) return null;
  const last = list[0];
  const t = signalText(last.kind, last.item);
  const body = (
    <>
      <span className="text-xl">{t.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.875rem]">
          <b>{name}:</b> {last.kind === "intim" ? "отметил близость" : t.text}
        </span>
        {list.length > 1 ? (
          <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            и ещё {list.length - 1}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 rounded-full px-3 py-1.5 text-[0.75rem] font-semibold text-white" style={{ background: FEM_GRADIENT }}>
        Открыть
      </span>
    </>
  );
  const cls = `fem-card animate-lift ${className} flex w-full items-center gap-3 rounded-3xl py-2.5 pl-4 pr-2.5 text-left transition active:scale-[0.98]`;
  return href ? (
    <Link href={href} replace className={cls}>
      {body}
    </Link>
  ) : (
    <button onClick={onOpen} className={cls}>
      {body}
    </button>
  );
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const y = new Date();
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Сегодня";
  if (d.toDateString() === y.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function Chat({
  who,
  name,
  status,
  tip,
  info,
  periods,
  likes,
  bottom,
}: {
  /** Чей экран: её («her») или партнёра. */
  who: "her" | "partner";
  /** Имя того, с кем переписка. */
  name: string;
  /** Партнёру: её статус дня. */
  status?: string | null;
  /** Партнёру: совет на сегодня. */
  tip?: string | null;
  info?: CycleInfo | null;
  periods?: FemPeriod[];
  /** Партнёру: что она любит. */
  likes?: Likes;
  /** Отступ панели ввода от низа экрана — над нижним меню или без него. */
  bottom: string;
}) {
  const { signals, userId, replySignal, confirmIntimacy, clearChat, markSignalsSeen, refreshSignals, days, saveDay, settings, saveSettings } =
    useFem();
  const { send, run, note, busy } = useSend();
  const now = today();
  const [text, setText] = useState("");
  const [sheet, setSheet] = useState<"buy" | "invite" | "likes" | "ask" | "status" | "clear" | null>(null);
  const [answered, setAnswered] = useState<Map<number, string>>(new Map());

  // Чат открыт — переписка подтягивается чаще, чем раз в 30 секунд.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refreshSignals();
    }, 8000);
    return () => clearInterval(t);
  }, [refreshSignals]);

  // Всё входящее, что видно в ленте, — прочитано.
  useEffect(() => {
    if (signals.some((s) => s.to_id === userId && !s.seen_at)) void markSignalsSeen();
  }, [signals, userId, markSignalsSeen]);

  const feed = useMemo(() => [...signals].sort((a, b) => a.created_at.localeCompare(b.created_at)), [signals]);
  const byId = useMemo(() => new Map(signals.map((s) => [s.id, s])), [signals]);

  // Новое внизу — прокручиваем в самый низ, под панель ввода.
  const count = feed.length;
  const first = useRef(true);
  useEffect(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: first.current ? "auto" : "smooth" });
    first.current = false;
  }, [count]);

  const sendText = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    const ok = await send("msg", t);
    if (!ok) setText(t);
  };

  const reply = (s: FemSignal, t: string, done: boolean) => {
    setAnswered((prev) => new Map(prev).set(s.id, t));
    void run(() => replySignal(s.id, done ? "done" : "reply", t));
  };

  const customAsks = settings?.custom_asks ?? [];
  const customStatuses = settings?.custom_statuses ?? [];
  const myStatus = days.get(now)?.status ?? null;
  const herStatus = statusOf(status);

  let lastDay = "";

  return (
    <div>
      {/* ───── сверху: статус дня (её) или её статус и совет (его) ───── */}
      {who === "her" ? (
        <div className="fem-card rounded-3xl p-3.5">
          <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
            <p className="text-[0.8125rem] font-semibold">Статус на сегодня</p>
            <button onClick={() => setSheet("likes")} className="text-[0.75rem] font-medium" style={{ color: "var(--accent)" }}>
              💝 Что я люблю
            </button>
          </div>
          <div className="-mx-3.5 flex gap-1.5 overflow-x-auto px-3.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[...STATUSES, ...customStatuses.map((c) => ({ value: `c:${packCustom(c.emoji, c.label)}`, emoji: c.emoji, label: c.label }))].map((st) => {
              const on = myStatus === st.value;
              return (
                <button
                  key={st.value}
                  onClick={() => void saveDay(now, { status: on ? null : st.value })}
                  aria-pressed={on}
                  className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] transition active:scale-95"
                  style={{ background: on ? FEM_GRADIENT : "var(--surface-2)", color: on ? "#fff" : "var(--text)" }}
                >
                  <span>{st.emoji}</span>
                  {st.label}
                </button>
              );
            })}
            <button
              onClick={() => setSheet("status")}
              className="flex shrink-0 items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-[0.8125rem] transition active:scale-95"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            >
              ＋ Свой
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {herStatus || tip ? (
            <div className="fem-card space-y-2 rounded-3xl px-4 py-3">
              {herStatus ? (
                <p className="flex items-center gap-2 text-[0.875rem]">
                  <span className="text-lg">{herStatus.emoji}</span>
                  <span>
                    <span style={{ color: "var(--muted)" }}>{name} сегодня: </span>
                    <b>{herStatus.label}</b>
                  </span>
                </p>
              ) : null}
              {tip ? (
                <p className="flex items-start gap-2 text-[0.875rem] leading-snug">
                  <span className="text-lg leading-5">💡</span>
                  <span>
                    <span style={{ color: "var(--muted)" }}>Совет на сегодня: </span>
                    {tip}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
          <LikesCard name={name} likes={likes ?? {}} />
        </div>
      )}

      {feed.length ? (
        <div className="mt-3 flex justify-end">
          <button onClick={() => setSheet("clear")} className="px-1 text-[0.75rem]" style={{ color: "var(--muted)" }}>
            🗑 Очистить переписку
          </button>
        </div>
      ) : null}

      {/* ───── лента ───── */}
      <div className="mt-4 flex flex-col gap-1.5">
        {feed.length === 0 ? (
          <p className="px-6 py-10 text-center text-[0.875rem] leading-snug" style={{ color: "var(--muted)" }}>
            Здесь будет ваша переписка. Напишите сообщение или нажмите быструю кнопку внизу.
          </p>
        ) : null}
        {feed.map((s) => {
          const mine = s.from_id === userId;
          const day = dayLabel(s.created_at);
          const sep = day !== lastDay;
          lastDay = day;
          return (
            <div key={s.id} className="flex flex-col">
              {sep ? (
                <p className="my-2 self-center rounded-full px-3 py-0.5 text-[0.6875rem] font-medium" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
                  {day}
                </p>
              ) : null}
              <Item
                s={s}
                mine={mine}
                who={who}
                name={name}
                orig={s.reply_to ? (byId.get(s.reply_to) ?? null) : null}
                signals={signals}
                answered={answered.get(s.id) ?? null}
                busy={busy}
                likes={likes}
                onReply={(t, done) => reply(s, t, done)}
                onConfirm={(ok) => {
                  const it = unpackIntim(s.item);
                  if (!it) return;
                  setAnswered((prev) => new Map(prev).set(s.id, ok ? "Да, было ✓" : "Не было"));
                  void run(() => confirmIntimacy(it.day, ok), ok ? "Отметка добавлена в календарь 🤍" : "Отметку убрали");
                }}
              />
            </div>
          );
        })}
      </div>

      {/* ───── панель ввода ───── */}
      <div className="sticky z-20 mt-3" style={{ bottom }}>
        {note ? (
          <p className="animate-lift mb-1.5 text-center text-[0.75rem]" style={{ color: note.bad ? "var(--danger)" : "var(--accent)" }}>
            {note.text}
          </p>
        ) : null}
        <div className="fem-card rounded-[1.5rem] p-2" style={{ boxShadow: "0 10px 30px -14px rgba(0,0,0,.35)" }}>
          <div className="-mx-2 flex gap-1.5 overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {who === "her" ? (
              <>
                <Quick emoji="💗" label="Нужна забота" disabled={busy} onClick={(e) => { burstAt(e, "💗"); void send("care", undefined); }} />
                <Quick emoji="🛍" label="Купи…" onClick={() => setSheet("buy")} />
                <Quick emoji="🌙" label="Побыть одной" disabled={busy} onClick={() => void send("alone", undefined)} />
                {customAsks.map((c) => (
                  <Quick key={c.emoji + c.label} emoji={c.emoji} label={c.label} disabled={busy} onClick={() => void send("custom", packCustom(c.emoji, c.label))} />
                ))}
                <Quick emoji="＋" label="Своя просьба" onClick={() => setSheet("ask")} dashed />
              </>
            ) : (
              <>
                <Quick emoji="❤️" label="Думаю о тебе" disabled={busy} onClick={(e) => { burstAt(e, "❤️"); void send("heart", undefined); }} />
                <Quick emoji="💌" label="Позвать на вечер" onClick={() => setSheet("invite")} />
              </>
            )}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={1}
              maxLength={500}
              placeholder="Сообщение…"
              className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-2xl border px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-[var(--accent)]"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              onClick={() => void sendText()}
              disabled={!text.trim() || busy}
              aria-label="Отправить"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg text-white transition active:scale-95 disabled:opacity-40"
              style={{ background: FEM_GRADIENT }}
            >
              ➤
            </button>
          </div>
        </div>
      </div>

      {/* ───── листы ───── */}
      <Sheet open={sheet === "buy"} title="Что купить?" onClose={() => setSheet(null)}>
        <div className="grid grid-cols-2 gap-2 pb-3">
          {BUY_ITEMS.map((it) => (
            <button
              key={it.value}
              onClick={() => {
                setSheet(null);
                void send("buy", it.value);
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
      <Sheet open={sheet === "ask" || sheet === "status"} title={sheet === "ask" ? "Свои просьбы" : "Свои статусы"} onClose={() => setSheet(null)}>
        {sheet === "ask" || sheet === "status" ? (
          <CustomEditor
            kind={sheet === "ask" ? "ask" : "status"}
            items={sheet === "ask" ? customAsks : customStatuses}
            onSave={(next) => void saveSettings(sheet === "ask" ? { custom_asks: next } : { custom_statuses: next })}
          />
        ) : null}
      </Sheet>
      <Sheet open={sheet === "clear"} title="Очистить переписку?" onClose={() => setSheet(null)}>
        <div className="space-y-3 pb-3">
          <p className="text-[0.875rem] leading-snug" style={{ color: "var(--muted)" }}>
            Удалятся все сообщения, просьбы, ответы и приглашения — у вас и у {who === "her" ? "партнёра" : name}. Вернуть их будет
            нельзя. Цикл, дневник и отметки в календаре останутся.
          </p>
          <button
            onClick={() => {
              setSheet(null);
              void run(() => clearChat(), "Переписка очищена");
            }}
            className="w-full rounded-2xl py-3 text-[0.9375rem] font-semibold text-white"
            style={{ background: "var(--danger)" }}
          >
            Удалить всю переписку
          </button>
          <button onClick={() => setSheet(null)} className="w-full rounded-2xl py-3 text-[0.9375rem] font-semibold" style={{ background: "var(--surface-2)" }}>
            Отмена
          </button>
        </div>
      </Sheet>
      <Sheet open={sheet === "likes"} title="Что я люблю" onClose={() => setSheet(null)}>
        {sheet === "likes" ? <LikesEditor name={name} likes={settings?.likes ?? {}} onSave={(next) => void saveSettings({ likes: next })} /> : null}
      </Sheet>
      <Sheet open={sheet === "invite"} title="Позвать на вечер" onClose={() => setSheet(null)}>
        {sheet === "invite" ? (
          <InviteForm
            name={name}
            info={info ?? null}
            periods={periods ?? []}
            onSend={(item) => {
              setSheet(null);
              void send("invite", item);
            }}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function burstAt(e: React.MouseEvent, emoji: string) {
  const { x, y } = centerOf(e);
  burst(x, y, emoji, 5);
}

function Quick({
  emoji,
  label,
  onClick,
  disabled,
  dashed,
}: {
  emoji: string;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  dashed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition active:scale-95 disabled:opacity-60 ${dashed ? "border border-dashed" : ""}`}
      style={dashed ? { borderColor: "var(--accent)", color: "var(--accent)" } : { background: "var(--surface-2)" }}
    >
      <span>{emoji}</span>
      {label}
    </button>
  );
}

/** Один элемент ленты: пузырь и, если нужно, ответ на него. */
function Item({
  s,
  mine,
  who,
  name,
  orig,
  signals,
  answered,
  busy,
  likes,
  onReply,
  onConfirm,
}: {
  s: FemSignal;
  mine: boolean;
  who: "her" | "partner";
  name: string;
  orig: FemSignal | null;
  signals: FemSignal[];
  answered: string | null;
  busy: boolean;
  likes?: Likes;
  onReply: (text: string, done: boolean) => void;
  onConfirm: (ok: boolean) => void;
}) {
  const t = signalText(s.kind, s.item);
  const { reply, done } = repliesTo(signals, s);
  const isAsk = ASKS.has(s.kind);
  const now = today();

  let body: ReactNode;
  if (s.kind === "msg") body = <span className="whitespace-pre-wrap break-words">{s.item}</span>;
  else if (s.kind === "ok") {
    // Старый формат «Уже бегу»: в item — на что ответ, «вид:подробности».
    const [k, ...rest] = (s.item ?? "").split(":");
    const o = k ? signalText(k, rest.join(":") || null) : null;
    body = (
      <>
        {o ? (
          <span className="mb-1 block truncate border-l-2 pl-2 text-[0.75rem] opacity-80" style={{ borderColor: "currentColor" }}>
            {o.emoji} {o.text}
          </span>
        ) : null}
        <span>Уже бегу! 🏃</span>
      </>
    );
  } else if (REPLY_KINDS.has(s.kind)) {
    const o = orig ? signalText(orig.kind, orig.item) : null;
    body = (
      <>
        {o ? (
          <span className="mb-1 block truncate border-l-2 pl-2 text-[0.75rem] opacity-80" style={{ borderColor: "currentColor" }}>
            {o.emoji} {orig?.kind === "msg" ? orig.item : o.text}
          </span>
        ) : null}
        <span className="whitespace-pre-wrap break-words">{s.item ?? "Уже бегу! 🏃"}</span>
      </>
    );
  } else if (s.kind === "invite") {
    const inv = unpackInvite(s.item);
    body = (
      <>
        <span className="block text-[0.75rem] opacity-80">💌 {mine ? "Вы зовёте" : "Зовёт"}</span>
        <span className="block text-[1rem] font-semibold">
          {inv ? `${inv.emoji} ${inv.label}, ${whenText(inv.day, inv.time, now)}` : "Провести вечер вместе"}
        </span>
      </>
    );
  } else if (s.kind === "intim") {
    const it = unpackIntim(s.item);
    body = (
      <>
        <span className="block text-[0.75rem] opacity-80">🤍 Отметка близости</span>
        <span className="block font-semibold">{it ? intimLine(it, now) : ""}</span>
        <span className="block text-[0.75rem] opacity-80">
          {mine ? (s.dismissed_at ? "Ответ получен" : "Ждёт подтверждения") : s.dismissed_at ? "Вы ответили" : "Было?"}
        </span>
      </>
    );
  } else {
    body = (
      <span className="flex items-center gap-2">
        <span className="text-xl">{t.emoji}</span>
        <span className="font-semibold">{s.kind === "heart" ? "Думаю о тебе" : t.text}</span>
      </span>
    );
  }

  // Что можно сделать с этим прямо в ленте.
  let actions: ReactNode = null;
  if (!mine && !answered) {
    if ((isAsk || s.kind === "heart" || s.kind === "invite") && !reply && !done && recent(s)) {
      actions = <ReplyBox presets={REPLIES[s.kind] ?? REPLIES.custom} busy={busy} onSend={onReply} />;
    } else if (ERRANDS.has(s.kind) && reply && !done && recent(s)) {
      actions = (
        <button
          onClick={() => onReply(doneText(s.kind), true)}
          disabled={busy}
          className="mt-2 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold text-white transition active:scale-95 disabled:opacity-60"
          style={{ background: "#14b8a6" }}
        >
          {doneText(s.kind)}
        </button>
      );
    } else if (s.kind === "intim" && who === "her" && !s.dismissed_at) {
      actions = (
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => onConfirm(true)}
            className="rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold text-white transition active:scale-95"
            style={{ background: FEM_GRADIENT }}
          >
            Да, было ✓
          </button>
          <button
            onClick={() => onConfirm(false)}
            className="rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold transition active:scale-95"
            style={{ background: "var(--surface-2)" }}
          >
            Не было
          </button>
        </div>
      );
    }
  }
  const like = !mine && who === "partner" && s.kind === "buy" ? likes?.[LIKE_FOR_ITEM[s.item ?? ""] ?? ""] : null;

  // Ход моей просьбы: отправлено → увидел → бежит → готово.
  const steps =
    mine && (isAsk || s.kind === "invite")
      ? ERRANDS.has(s.kind)
        ? ["Отправлено", who === "her" ? "Увидел" : "Увидела", "Бежит", "Готово"]
        : ["Отправлено", who === "her" ? "Увидел" : "Увидела", who === "her" ? "Ответил" : "Ответила"]
      : null;
  const at = done ? 3 : reply ? 2 : s.seen_at ? 1 : 0;

  return (
    <div className={`flex max-w-[86%] flex-col ${mine ? "items-end self-end" : "items-start self-start"}`}>
      <div
        className="rounded-[1.25rem] px-3.5 py-2.5 text-[0.9375rem] leading-snug"
        style={
          mine
            ? { background: FEM_GRADIENT, color: "#fff", borderBottomRightRadius: 6 }
            : { background: "var(--surface)", border: "1px solid var(--border)", borderBottomLeftRadius: 6 }
        }
      >
        {body}
        {like ? (
          <span className="mt-1.5 block text-[0.75rem]" style={{ color: "var(--muted)" }}>
            💝 {name} любит: <b>{like}</b>
          </span>
        ) : null}
      </div>
      {steps ? (
        <div className="mt-1 w-full min-w-[15rem]">
          <Steps steps={steps} at={Math.min(at, steps.length - 1)} />
        </div>
      ) : null}
      {actions}
      {/* Пока ответ не пришёл из базы отдельным пузырём — короткое «Вы: …». */}
      {answered && (s.kind === "intim" ? !s.dismissed_at : !reply && !done) ? (
        <p className="animate-lift mt-1 text-[0.75rem] font-medium" style={{ color: "#14b8a6" }}>
          Вы: {answered} ✓
        </p>
      ) : null}
      <span className="mt-0.5 px-1 text-[0.625rem] tabular-nums" style={{ color: "var(--muted)" }}>
        {clock(s.created_at)}
        {mine && s.kind === "msg" && s.seen_at ? " · прочитано" : ""}
      </span>
    </div>
  );
}

/**
 * Свои статусы или просьбы: выбрать смайлик, написать пару слов — и они
 * появятся рядом с готовыми. Тут же — удалить ненужные.
 */
function CustomEditor({
  kind,
  items,
  onSave,
}: {
  kind: "status" | "ask";
  items: { emoji: string; label: string }[];
  onSave: (next: { emoji: string; label: string }[]) => void;
}) {
  const [emoji, setEmoji] = useState(EMOJI_CHOICES[0]);
  const [label, setLabel] = useState("");
  const full = items.length >= 12;
  const add = () => {
    const text = label.trim();
    if (!text || full) return;
    onSave([...items, { emoji, label: text }]);
    setLabel("");
  };
  return (
    <div className="space-y-3 pb-3">
      <p className="text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
        {kind === "ask"
          ? "Своя просьба появится рядом с готовыми и придёт партнёру уведомлением, например «🍕 Закажи пиццу»."
          : "Свой статус появится рядом с готовыми, партнёр увидит его на своём экране, например «🛁 Ванна и тишина»."}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {EMOJI_CHOICES.map((e) => (
          <button
            key={e}
            onClick={() => setEmoji(e)}
            aria-pressed={emoji === e}
            className="flex h-10 w-10 items-center justify-center rounded-full text-xl transition active:scale-90"
            style={{ background: emoji === e ? "var(--surface-2)" : "transparent", outline: emoji === e ? "2px solid var(--accent)" : "none" }}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl" style={{ background: "var(--surface-2)" }}>
          {emoji}
        </span>
        <input
          className="min-w-0 flex-1 rounded-2xl border px-3.5 text-[0.9375rem] outline-none focus:border-[var(--accent)]"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
          value={label}
          maxLength={28}
          placeholder={kind === "ask" ? "Закажи пиццу" : "Ванна и тишина"}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
      </div>
      <button
        onClick={add}
        disabled={!label.trim() || full}
        className="w-full rounded-2xl py-3 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: FEM_GRADIENT }}
      >
        {full ? "Не больше 12 — удалите ненужные" : "Добавить"}
      </button>
      {items.length ? (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
            {kind === "ask" ? "Ваши просьбы" : "Ваши статусы"}
          </p>
          {items.map((it, i) => (
            <div key={it.emoji + it.label + i} className="flex items-center gap-2.5 rounded-2xl px-3 py-2" style={{ background: "var(--surface-2)" }}>
              <span className="text-lg">{it.emoji}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{it.label}</span>
              <button
                onClick={() => onSave(items.filter((_, k) => k !== i))}
                aria-label={`Удалить «${it.label}»`}
                className="p-1 text-[0.8125rem]"
                style={{ color: "var(--danger)" }}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

