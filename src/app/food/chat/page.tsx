"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { Sheet } from "@/components/ui";
import { useFood } from "@/components/food/DataProvider";
import { FoodHeader } from "@/components/food/Shell";
import { ItemRow, shrink } from "@/components/food/AddFood";
import { BarcodeFlow } from "@/components/food/Barcode";
import { FoodPic } from "@/components/food/FoodPic";
import { norm as normName, ownDishes, usePics, useProducts } from "@/components/food/Search";
import { useBurnedByDay } from "@/components/food/Workouts";
import { normFor, totals, withBurned } from "@/lib/food/norms";
import { sugarName } from "@/lib/food/sugar";
import { MEALS, mealNow, type DraftItem, type Meal, type Source } from "@/lib/food/types";
import { ul, unitOf } from "@/lib/food/units";
import { addDays, today } from "@/lib/tasks/dates";

/** Ответ с блюдами: можно поправить, выбрать приём пищи и записать. */
interface Card {
  items: DraftItem[];
  meal: Meal;
  day: string;
  source: Source;
  comment?: string;
  saved?: boolean;
  editing?: boolean;
}

interface Msg {
  id: string;
  me?: boolean;
  text?: string;
  /** Фото живёт только до перезагрузки: в историю не сохраняем, как и везде в Yumdots. */
  photo?: string;
  hadPhoto?: boolean;
  card?: Card;
  busy?: boolean;
}

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const MEAL_IN: Record<Meal, string> = { breakfast: "в завтрак", lunch: "в обед", dinner: "в ужин", snack: "в перекус" };

/** «На ужин», «вчера» в тексте — сразу ставим нужный приём пищи и день. */
function guessWhen(text: string): { meal?: Meal; yesterday: boolean } {
  const t = text.toLowerCase();
  const meal: Meal | undefined = /завтрак/.test(t) ? "breakfast" : /обед/.test(t) ? "lunch" : /ужин/.test(t) ? "dinner" : /перекус|полдник/.test(t) ? "snack" : undefined;
  return { meal, yesterday: /вчера/.test(t) };
}

function load(key: string): Msg[] {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? (JSON.parse(raw) as Msg[]) : [];
    return Array.isArray(list) ? list.filter((m) => !m.busy) : [];
  } catch {
    return [];
  }
}

/**
 * Чат Yumdots: пишете, что съели, или шлёте фото. В ответ список блюд с
 * калориями: его можно поправить и записать в нужный приём пищи.
 */
export default function FoodChat() {
  const { entries, settings, profile, addEntries } = useFood();
  const key = `yum-chat-${profile?.id ?? "me"}`;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [scan, setScan] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const { products } = useProducts(true);
  const pics = usePics(products);

  useEffect(() => {
    setMsgs(load(key));
    setLoaded(true);
  }, [key]);

  // История — только на этом телефоне, последние 60 сообщений, без фото.
  useEffect(() => {
    if (!loaded) return;
    try {
      const keep = msgs.filter((m) => !m.busy).slice(-60).map(({ photo, ...m }) => (photo ? { ...m, hadPhoto: true } : m));
      localStorage.setItem(key, JSON.stringify(keep));
    } catch {
      /* приватный режим — просто не сохраняем */
    }
  }, [msgs, loaded, key]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: loaded ? "smooth" : "auto", block: "end" });
  }, [msgs.length, loaded]);

  // Сверху — сколько съедено сегодня из нормы.
  const now = today();
  const burned = useBurnedByDay().get(now) ?? 0;
  const norm = withBurned(normFor(settings), burned);
  const eaten = totals(entries.filter((e) => e.day === now)).kcal;

  // Быстрые кнопки над полем: «Как вчера» и то, что чаще едите в это время.
  const mealHere = mealNow();
  const yesterdayMeal = useMemo(() => entries.filter((e) => e.day === addDays(now, -1) && e.meal === mealHere), [entries, now, mealHere]);
  const quick = useMemo(
    () => ownDishes(entries, mealHere).sort((a, b) => b.inMeal - a.inMeal || b.times - a.times).slice(0, 8),
    [entries, mealHere],
  );

  const update = (id: string, fn: (m: Msg) => Msg) => setMsgs((list) => list.map((m) => (m.id === id ? fn(m) : m)));
  const updateCard = (id: string, fn: (c: Card) => Card) => update(id, (m) => (m.card ? { ...m, card: fn(m.card) } : m));

  const newCard = (items: DraftItem[], source: Source, when: { meal?: Meal; yesterday: boolean }, comment?: string): Card => ({
    items,
    source,
    comment,
    meal: when.meal ?? mealHere,
    day: when.yesterday ? addDays(now, -1) : now,
  });

  const analyze = async (payload: { text?: string; image?: string }, source: Source, when: { meal?: Meal; yesterday: boolean }) => {
    const id = uid();
    setMsgs((list) => [...list, { id, busy: true, text: payload.image ? "Смотрю, что на тарелке…" : "Считаю…" }]);
    if (!navigator.onLine) {
      update(id, () => ({ id, text: "Без интернета не посчитаю. Нажмите на блюдо внизу, если ели его раньше, или запишите через «+»" }));
      return;
    }
    try {
      const res = await fetch("/api/food-analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => null)) as { items?: DraftItem[]; comment?: string; error?: string } | null;
      if (!res.ok || !data?.items) throw new Error(data?.error ?? "Не получилось посчитать, попробуйте ещё раз");
      if (!data.items.length) {
        update(id, () => ({ id, text: data.comment || "Не понял, что за еда. Напишите по-другому, например «гречка 200 г»" }));
        return;
      }
      update(id, () => ({ id, card: newCard(data.items!, source, when, data.comment || undefined) }));
    } catch (e) {
      update(id, () => ({ id, text: e instanceof Error ? e.message : String(e) }));
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMsgs((list) => [...list, { id: uid(), me: true, text }]);
    void analyze({ text }, "text", guessWhen(text));
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    try {
      const image = await shrink(file);
      const text = input.trim();
      setInput("");
      setMsgs((list) => [...list, { id: uid(), me: true, photo: image, text: text || undefined }]);
      void analyze({ image, text: text || undefined }, "photo", guessWhen(text));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };

  /** Блюдо из быстрых кнопок: к последнему незаписанному ответу, иначе новым ответом. */
  const addQuick = (items: DraftItem[], label: string) => {
    setMsgs((list) => {
      const last = list[list.length - 1];
      if (last?.card && !last.card.saved && last.card.source === "repeat") {
        return list.map((m) => (m === last && m.card ? { ...m, card: { ...m.card, items: [...m.card.items, ...items] } } : m));
      }
      return [...list, { id: uid(), me: true, text: label }, { id: uid(), card: newCard(items, "repeat", { yesterday: false }) }];
    });
  };

  const save = async (id: string, card: Card) => {
    const list = card.items.filter((x) => x.name.trim()).map((x) => ({ ...x, name: sugarName(x) }));
    if (!list.length) return;
    try {
      await addEntries(list, card.meal, card.day, card.source);
      updateCard(id, (c) => ({ ...c, saved: true, editing: false }));
      navigator.vibrate?.(15);
    } catch (e) {
      setMsgs((l) => [...l, { id: uid(), text: e instanceof Error ? e.message : String(e) }]);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 200px)" }}>
      <FoodHeader
        title="Чат"
        sub={norm ? `Сегодня ${fmt(eaten)} из ${fmt(norm.kcal)} ккал` : `Сегодня ${fmt(eaten)} ккал`}
        action={
          msgs.length ? (
            <button
              onClick={() => {
                if (confirm("Очистить переписку? Записанная еда останется")) setMsgs([]);
              }}
              aria-label="Очистить переписку"
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}
            >
              <Icon name="trash" size={16} />
            </button>
          ) : null
        }
      />

      <div className="flex flex-col gap-2.5">
        <Bot>
          Напишите, что съели, например <b>«гречка 200 г и две котлеты»</b> или <b>«на завтрак овсянка и кофе с сахаром»</b>. Можно прислать фото тарелки. Я посчитаю калории, а вы проверите и запишете.
        </Bot>

        {msgs.map((m) =>
          m.me ? (
            <div key={m.id} className="animate-rise max-w-[80%] self-end overflow-hidden rounded-[20px] rounded-br-md text-[0.9375rem] text-white" style={{ background: "var(--accent)" }}>
              {m.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.photo} alt="Фото еды" className="block max-h-56 w-full object-cover" />
              ) : m.hadPhoto ? (
                <p className="px-3.5 pt-2 text-[0.8125rem] opacity-90">📷 Фото</p>
              ) : null}
              {m.text ? <p className="px-3.5 py-2">{m.text}</p> : m.hadPhoto ? <div className="h-2" /> : null}
            </div>
          ) : m.card ? (
            <CardView
              key={m.id}
              card={m.card}
              pics={pics}
              onChange={(fn) => updateCard(m.id, fn)}
              onSave={() => save(m.id, m.card!)}
            />
          ) : (
            <Bot key={m.id} busy={m.busy}>
              {m.text}
            </Bot>
          ),
        )}
        <div ref={endRef} style={{ scrollMarginBottom: "calc(env(safe-area-inset-bottom) + 210px)" }} />
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => (void onPhoto(e.target.files?.[0]), (e.target.value = ""))} />

      {/* Поле ввода — над нижним меню. */}
      <div className="fixed inset-x-0 z-30 px-3" style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}>
        <div className="mx-auto max-w-md rounded-[22px] p-2" style={{ background: "color-mix(in srgb, var(--surface) 94%, transparent)", border: "1px solid var(--border)", backdropFilter: "blur(12px)", boxShadow: "0 4px 18px rgba(0,0,0,0.08)" }}>
          {problem ? (
            <p className="mb-1.5 px-1.5 text-[0.75rem]" style={{ color: "var(--danger)" }}>
              {problem}
            </p>
          ) : null}
          {yesterdayMeal.length || quick.length ? (
            <div className="no-scrollbar -mx-2 mb-2 flex gap-1.5 overflow-x-auto px-2">
              {yesterdayMeal.length ? (
                <Chip
                  onClick={() =>
                    addQuick(
                      yesterdayMeal.map((e) => ({ name: e.name, grams: e.grams, unit: e.unit ?? null, kcal: Number(e.kcal), protein: Number(e.protein), fat: Number(e.fat), carbs: Number(e.carbs) })),
                      `Как вчера ${MEAL_IN[mealHere]}`,
                    )
                  }
                >
                  ↺ Как вчера
                </Chip>
              ) : null}
              {quick.map((d) => (
                <Chip key={d.item.name} onClick={() => addQuick([d.item], d.item.name)}>
                  {d.item.name}
                </Chip>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <button onClick={() => setScan(true)} aria-label="Штрихкод" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg" style={{ background: "var(--surface-2)" }}>
              🏷️
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              aria-label="Фото еды"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
              style={{ background: "linear-gradient(135deg, #fb923c, #ef4444)" }}
            >
              <Icon name="camera" size={19} />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  send();
                }
              }}
              enterKeyHint="send"
              maxLength={500}
              placeholder="Что съели?"
              aria-label="Что съели"
              className="h-10 min-w-0 flex-1 rounded-full px-4 text-[0.9375rem] outline-none"
              style={{ background: "var(--surface-2)" }}
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              aria-label="Отправить"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-35"
              style={{ background: "var(--accent)" }}
            >
              <Icon name="chevron-right" size={20} />
            </button>
          </div>
        </div>
      </div>

      <Sheet open={scan} title="Штрихкод" onClose={() => setScan(false)}>
        {scan ? (
          <BarcodeFlow
            onBack={() => setScan(false)}
            onItem={(it) => {
              setScan(false);
              setMsgs((list) => [...list, { id: uid(), me: true, text: `🏷️ ${it.name}` }, { id: uid(), card: newCard([it], "barcode", { yesterday: false }) }]);
            }}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function Bot({ children, busy }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <div
      className={`animate-rise max-w-[88%] self-start rounded-[20px] rounded-bl-md px-3.5 py-2.5 text-[0.875rem] leading-snug ${busy ? "food-scan" : ""}`}
      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: busy ? "var(--muted)" : undefined }}
    >
      {children}
    </div>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[0.8125rem] transition active:scale-95" style={{ background: "var(--surface-2)" }}>
      {children}
    </button>
  );
}

function CardView({ card, pics, onChange, onSave }: { card: Card; pics: Map<string, string>; onChange: (fn: (c: Card) => Card) => void; onSave: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const sum = totals(card.items);
  const meal = MEALS.find((m) => m.id === card.meal)!;
  const when = card.day === today() ? "" : card.day === addDays(today(), -1) ? " вчера" : "";
  return (
    <div className="animate-rise w-[92%] self-start rounded-[20px] rounded-bl-md p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      {card.editing && !card.saved ? (
        <ul className="space-y-2">
          {card.items.map((it, i) => (
            <ItemRow
              key={i}
              item={it}
              onChange={(next) => onChange((c) => ({ ...c, items: c.items.map((x, j) => (j === i ? next : x)) }))}
              onRemove={() => onChange((c) => ({ ...c, items: c.items.filter((_, j) => j !== i) }))}
            />
          ))}
        </ul>
      ) : (
        <ul>
          {card.items.map((it, i) => (
            <li key={i} className="flex items-center gap-2.5 py-1.5" style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
              <FoodPic src={pics.get(normName(it.name))} name={it.name} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.875rem] font-medium">{sugarName(it)}</span>
                <span className="block text-[0.6875rem] tabular-nums" style={{ color: "var(--muted)" }}>
                  {it.grams ? `${fmt(it.grams)} ${ul(unitOf(it))} · ` : ""}Б {fmt(it.protein)} · Ж {fmt(it.fat)} · У {fmt(it.carbs)}
                </span>
              </span>
              <span className="shrink-0 text-[0.875rem] font-semibold tabular-nums" style={{ color: "var(--accent)" }}>
                {fmt(it.kcal)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {card.comment ? (
        <p className="mt-1.5 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
          💡 {card.comment}
        </p>
      ) : null}

      <p className="mt-2 text-[0.8125rem] tabular-nums">
        Итого <b>{fmt(sum.kcal)} ккал</b>
        <span style={{ color: "var(--muted)" }}>
          {" "}
          · Б {fmt(sum.protein)} · Ж {fmt(sum.fat)} · У {fmt(sum.carbs)}
        </span>
      </p>

      {card.saved ? (
        <p className="mt-2 rounded-xl px-3 py-2 text-[0.8125rem] font-medium" style={{ background: "color-mix(in srgb, #22c55e 14%, transparent)", color: "#16a34a" }}>
          ✓ Записано: {meal.emoji} {meal.label.toLowerCase()}
          {when}
        </p>
      ) : (
        <>
          <div className="mt-2.5 grid grid-cols-4 gap-1">
            {MEALS.map((m) => (
              <button
                key={m.id}
                onClick={() => onChange((c) => ({ ...c, meal: m.id }))}
                aria-pressed={card.meal === m.id}
                className="rounded-full py-1.5 text-[0.6875rem] font-medium"
                style={card.meal === m.id ? { background: "var(--accent)", color: "#fff" } : { background: "var(--surface-2)" }}
              >
                {m.emoji} {m.label}
              </button>
            ))}
          </div>
          {when ? (
            <p className="mt-1.5 text-center text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              Запишу на вчера
            </p>
          ) : null}
          <div className="mt-2 flex gap-1.5">
            <button
              onClick={() => onChange((c) => ({ ...c, editing: !c.editing }))}
              className="flex-1 rounded-xl py-2.5 text-[0.8125rem] font-semibold"
              style={{ background: "var(--surface-2)" }}
            >
              {card.editing ? "Готово" : "Поправить"}
            </button>
            <button
              onClick={async () => {
                setSaving(true);
                await onSave();
                setSaving(false);
              }}
              disabled={saving || !card.items.length}
              className="flex-1 rounded-xl py-2.5 text-[0.8125rem] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {saving ? "Записываю…" : `Записать · ${fmt(sum.kcal)}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
