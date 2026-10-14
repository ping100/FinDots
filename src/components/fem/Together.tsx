"use client";

import { useEffect, useRef, useState } from "react";
import { today } from "@/lib/tasks/dates";
import { FEM_GRADIENT } from "@/lib/fem/cycle";
import { BUY_ITEMS, EMOJI_CHOICES, STATUSES, ago, packCustom, signalText, statusOf } from "@/lib/fem/together";
import { Sheet } from "@/components/ui";
import { useFem, type FemSignal, type SignalKind } from "./DataProvider";
import { burst, centerOf } from "@/lib/fem/fx";

/** Просьбы и сердечки живут 12 часов — дальше гаснут сами. */
const LIFE = 12 * 3_600_000;
const fresh = (s: FemSignal) => Date.now() - Date.parse(s.created_at) < LIFE && !s.dismissed_at;

/** Одинаковые сигналы — одной карточкой: последний и сколько их было. */
function grouped(list: FemSignal[]): { key: string; last: FemSignal; ids: number[]; count: number }[] {
  const map = new Map<string, { key: string; last: FemSignal; ids: number[]; count: number }>();
  for (const sig of list) {
    const key = `${sig.kind}:${sig.item ?? ""}`;
    const g = map.get(key);
    if (!g) map.set(key, { key, last: sig, ids: [sig.id], count: 1 });
    else {
      g.ids.push(sig.id);
      g.count++;
      if (Date.parse(sig.created_at) > Date.parse(g.last.created_at)) g.last = sig;
    }
  }
  return [...map.values()].sort((a, b) => Date.parse(b.last.created_at) - Date.parse(a.last.created_at));
}

/**
 * Карточку можно смахнуть влево — она уезжает и пропадает. Вертикальная
 * прокрутка не мешает: свайп ловим, только если палец идёт вбок. Для тех,
 * кто не догадается смахнуть, children-функция получает close — им
 * работает видимая кнопка ×.
 */
export function Swipeable({
  onDismiss,
  leaving,
  children,
}: {
  onDismiss: () => void;
  leaving?: boolean;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const horizontal = useRef<boolean | null>(null);
  // Свежий колбэк без перезапуска таймера на каждой отрисовке.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (!leaving) return;
    setGone(true);
    const t = setTimeout(() => dismiss.current(), 260);
    return () => clearTimeout(t);
  }, [leaving]);
  const out = gone || leaving;
  const close = () => {
    setGone(true);
    setTimeout(() => dismiss.current(), 260);
  };
  return (
    <div
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        horizontal.current = null;
      }}
      onPointerMove={(e) => {
        const st = start.current;
        if (!st || st.id !== e.pointerId) return;
        const mx = e.clientX - st.x;
        const my = e.clientY - st.y;
        if (horizontal.current === null && Math.abs(mx) + Math.abs(my) > 8) horizontal.current = Math.abs(mx) > Math.abs(my);
        if (horizontal.current) setDx(Math.min(0, mx));
      }}
      onPointerUp={() => {
        start.current = null;
        if (dx < -90) close();
        else setDx(0);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDx(0);
      }}
      style={{
        touchAction: "pan-y",
        transform: out ? "translateX(-110%)" : `translateX(${dx}px)`,
        opacity: out ? 0 : 1 - Math.min(0.6, -dx / 300),
        transition: start.current ? "none" : "transform 250ms ease, opacity 250ms ease",
      }}
    >
      {typeof children === "function" ? children(close) : children}
    </div>
  );
}

/** Маленький крестик «Скрыть» — то же, что смахнуть. */
function CloseX({ onClick, label = "Скрыть" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={label}
      title={label}
      className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[1rem] leading-none transition active:scale-90"
      style={{ color: "var(--muted)" }}
    >
      ×
    </button>
  );
}

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
  const { share, signals, userId, days, saveDay, markSignalsSeen, settings, saveSettings } = useFem();
  const [buy, setBuy] = useState(false);
  const [editing, setEditing] = useState<"status" | "ask" | null>(null);
  const customStatuses = settings?.custom_statuses ?? [];
  const customAsks = settings?.custom_asks ?? [];
  const { send, note, busy } = useSend();
  const now = today();
  const name = share?.partner_name;
  const { dismissSignals } = useFem();
  const incomingAll = signals.filter((s) => s.to_id === userId && fresh(s));
  const incoming = grouped(incomingAll).slice(0, 3);
  const status = days.get(now)?.status ?? null;

  useEffect(() => {
    if (incomingAll.some((s) => !s.seen_at)) void markSignalsSeen();
  }, [incomingAll, markSignalsSeen]);

  if (!name) return null;

  return (
    <div className="fem-card mt-3 rounded-3xl p-4">
      <p className="text-[0.9375rem] font-semibold">Вы и {name}</p>

      {incoming.length ? (
        <div className="mt-2.5 space-y-1.5">
          {incoming.map((g) => {
            const t = signalText(g.last.kind, g.last.item);
            return (
              <Swipeable key={g.key} onDismiss={() => void dismissSignals(g.ids)}>
                {(close) => (
                <div className="flex items-center gap-2.5 rounded-2xl py-2 pl-3 pr-2" style={{ background: "var(--surface-2)" }}>
                  <span className="text-lg">{t.emoji}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    <b>{name}:</b> {t.text}
                    {g.count > 1 ? <span style={{ color: "var(--muted)" }}> ×{g.count}</span> : null}
                  </span>
                  <span className="shrink-0 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                    {ago(g.last.created_at)}
                  </span>
                  <CloseX onClick={close} />
                </div>
                )}
              </Swipeable>
            );
          })}
        </div>
      ) : null}

      <p className="mb-1.5 mt-3 text-xs font-semibold" style={{ color: "var(--muted)" }}>
        Статус на сегодня — {name} увидит его
      </p>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          ...STATUSES,
          ...customStatuses.map((c) => ({ value: `c:${packCustom(c.emoji, c.label)}`, emoji: c.emoji, label: c.label })),
        ].map((st) => {
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
        <button
          onClick={() => setEditing("status")}
          className="flex shrink-0 items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-[0.8125rem] transition active:scale-95"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          ＋ Свой
        </button>
      </div>

      <p className="mb-1.5 mt-3 text-xs font-semibold" style={{ color: "var(--muted)" }}>
        Попросить одним нажатием
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Ask emoji="💗" label="Нужна забота" disabled={busy} onClick={() => void send("care", undefined, `Отправлено ${name} 💗`)} />
        <Ask emoji="🛍" label="Купи по дороге" disabled={busy} onClick={() => setBuy(true)} />
        <Ask emoji="🌙" label="Побыть одной" disabled={busy} onClick={() => void send("alone", undefined, `${name} узнает, что вам нужно время`)} />
        {customAsks.map((c) => (
          <Ask
            key={c.emoji + c.label}
            emoji={c.emoji}
            label={c.label}
            disabled={busy}
            onClick={() => void send("custom", packCustom(c.emoji, c.label), `Отправлено ${name}: ${c.label}`)}
          />
        ))}
        <button
          onClick={() => setEditing("ask")}
          className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed px-1 py-3 text-center text-[0.75rem] font-medium transition active:scale-95"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          <span className="text-xl leading-none">＋</span>
          Своя просьба
        </button>
      </div>
      <Note note={note} />

      <Sheet
        open={editing !== null}
        title={editing === "ask" ? "Свои просьбы" : "Свои статусы"}
        onClose={() => setEditing(null)}
      >
        {editing ? (
          <CustomEditor
            kind={editing}
            items={editing === "ask" ? customAsks : customStatuses}
            onSave={(next) => void saveSettings(editing === "ask" ? { custom_asks: next } : { custom_statuses: next })}
          />
        ) : null}
      </Sheet>

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
      onClick={(e) => {
        const { x, y } = centerOf(e);
        burst(x, y, emoji);
        onClick();
      }}
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
  const { signals, userId, markSignalsSeen, dismissSignals } = useFem();
  const { send, note, busy } = useSend();
  const now = today();
  // Ответил ли уже на эту просьбу — «ok» с её ключом после неё (старые «ok»
  // без ключа отвечали на всё сразу).
  const answered = (s: FemSignal) =>
    signals.some(
      (x) =>
        x.from_id === userId &&
        x.kind === "ok" &&
        (!x.item || x.item === `${s.kind}:${s.item ?? ""}`) &&
        Date.parse(x.created_at) > Date.parse(s.created_at),
    );
  // Только что ответил — карточка пару секунд показывает «Ответили ✓» и уходит.
  const [done, setDone] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const keyOf = (s: FemSignal) => `${s.kind}:${s.item ?? ""}`;
  const pending = signals.filter((s) => s.to_id === userId && fresh(s) && s.kind !== "heart" && s.kind !== "ok");
  const asks = grouped(pending.filter((s) => !answered(s) || done.has(keyOf(s)))).slice(0, 3);
  // Статус дня тоже можно смахнуть — до конца дня (память телефона).
  const [statusHidden, setStatusHidden] = useState(false);
  useEffect(() => {
    try {
      setStatusHidden(localStorage.getItem("fem.status.hidden") === `${now}:${status}`);
    } catch {
      // Нет памяти — просто показываем.
    }
  }, [now, status]);
  const st = statusHidden ? null : statusOf(status);

  useEffect(() => {
    if (pending.some((s) => !s.seen_at)) void markSignalsSeen();
  }, [pending, markSignalsSeen]);

  // Отвеченные раньше (до перезахода) — убираем тихо.
  useEffect(() => {
    const old = pending.filter((s) => answered(s) && !done.has(keyOf(s))).map((s) => s.id);
    if (old.length) void dismissSignals(old);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals]);

  const reply = async (g: { key: string; ids: number[] }) => {
    // key — «care:» или «buy:chocolate»: ответ привязан к этой просьбе.
    setDone((prev) => new Set(prev).add(g.key));
    await send("ok", g.key, `${name} знает, что вы уже бежите`);
    setTimeout(() => setLeaving((prev) => new Set(prev).add(g.key)), 1500);
  };

  return (
    <div className="mb-4 space-y-2.5">
      {asks.map((g) => {
        const t = signalText(g.last.kind, g.last.item);
        const isDone = done.has(g.key);
        return (
          <Swipeable key={g.key} leaving={leaving.has(g.key)} onDismiss={() => void dismissSignals(g.ids)}>
            {(close) => (
            <div className="fem-card animate-lift flex items-center gap-3 rounded-3xl py-3 pl-4 pr-3">
              <span className="text-2xl">{t.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold leading-snug">
                  {t.text}
                  {g.count > 1 ? <span className="font-normal" style={{ color: "var(--muted)" }}> ×{g.count}</span> : null}
                </span>
                <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                  {name} · {ago(g.last.created_at)}
                </span>
              </span>
              {g.last.kind === "alone" ? (
                // Тут не бежать, а дать время — достаточно показать, что прочитал.
                <button
                  onClick={close}
                  className="shrink-0 rounded-full px-3 py-2 text-[0.8125rem] font-semibold"
                  style={{ background: "var(--surface-2)", color: "var(--accent)" }}
                >
                  Понял 👌
                </button>
              ) : (
                <button
                  onClick={() => void reply(g)}
                  disabled={busy || isDone}
                  className="shrink-0 rounded-full px-3 py-2 text-[0.8125rem] font-semibold text-white disabled:opacity-80"
                  style={{ background: isDone ? "#14b8a6" : FEM_GRADIENT }}
                >
                  {isDone ? "Ответили ✓" : "Уже бегу 🏃"}
                </button>
              )}
              {g.last.kind !== "alone" && !isDone ? <CloseX onClick={close} /> : null}
            </div>
            )}
          </Swipeable>
        );
      })}

      {st ? (
        <Swipeable
          key={`status-${status}`}
          onDismiss={() => {
            setStatusHidden(true);
            try {
              localStorage.setItem("fem.status.hidden", `${now}:${status}`);
            } catch {
              // Не запомнили — после перезахода статус покажется снова.
            }
          }}
        >
          {(close) => (
          <div className="fem-card flex items-center gap-3 rounded-3xl py-3 pl-4 pr-3">
            <span className="text-2xl">{st.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
                {name} сегодня
              </span>
              <span className="block text-[0.9375rem] font-semibold">{st.label}</span>
            </span>
            <CloseX onClick={close} label="Скрыть до завтра" />
          </div>
          )}
        </Swipeable>
      ) : null}

      <button
        onClick={(e) => {
          const { x, y } = centerOf(e);
          burst(x, y, "❤️", 5);
          void send("heart", undefined, `${name} получит ваше «Думаю о тебе» ❤️`);
        }}
        disabled={busy}
        className="fem-shine flex w-full items-center justify-center gap-2 rounded-3xl py-3.5 text-[0.9375rem] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
        style={{ background: FEM_GRADIENT, boxShadow: "0 12px 26px -12px rgba(236,72,153,0.75), inset 0 1px 0 rgba(255,255,255,0.35)" }}
      >
        <span className="animate-heartbeat">❤️</span> Думаю о тебе
      </button>
      <Note note={note} />
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
