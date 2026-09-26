"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/lib/icons";
import { type PushState, disablePush, enablePush, pushState, testPush } from "@/lib/pushClient";

/** Подсказка, что делать в каждом состоянии. */
const HINTS: Record<PushState, string> = {
  unsupported: "Этот браузер не умеет показывать уведомления.",
  install:
    "На iPhone уведомления приходят только приложению с экрана «Домой»: в Safari «Поделиться» → «На экран „Домой“», и откройте Dots оттуда.",
  denied: "Уведомления запрещены. Разрешить их можно в настройках телефона: Настройки → Уведомления → Dots.",
  off: "Уведомления придут в назначенное время, даже когда приложение закрыто.",
  on: "Включены на этом устройстве.",
};

/** Состояние уведомлений на этом устройстве. null — ещё выясняем. */
export function usePushState() {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  return [state, setState] as const;
}

/**
 * Уведомления в настройках: включить, проверить, выключить.
 *
 * Подписка на пуш — не про конкретное приложение, а про это устройство и
 * учётную запись целиком (одна и та же строка в push_subscriptions
 * обслуживает и напоминания задач, и всё, что появится в Findots позже),
 * поэтому строка одинаковая что в money/settings, что в tasks/settings —
 * включить можно из любого места, а не только там, где реально шлют пуши
 * сегодня.
 */
export function PushSettings() {
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (state === null) return null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await action();
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Не получилось");
    }
    setBusy(false);
  };

  return (
    <div className="mb-4 rounded-2xl px-4 py-3.5" style={{ background: "var(--surface)" }}>
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: state === "on" ? "var(--ok)" : "#f59e0b" }}
        >
          <Icon name="bell" size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem]">Уведомления</span>
          <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
            {HINTS[state]}
          </span>
        </span>
      </div>

      {state === "off" ? (
        <button
          onClick={() => void run(async () => setState(await enablePush()))}
          disabled={busy}
          className="mt-3 w-full rounded-2xl px-4 py-2.5 text-[0.875rem] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {busy ? "Минуту…" : "Включить уведомления"}
        </button>
      ) : null}

      {state === "on" ? (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() =>
              void run(async () => {
                const error = await testPush();
                setNote(error ?? "Отправили — уведомление придёт через пару секунд");
              })
            }
            disabled={busy}
            className="flex-1 rounded-2xl px-3 py-2 text-[0.8125rem] font-medium disabled:opacity-50"
            style={{ background: "var(--surface-2)" }}
          >
            Проверить
          </button>
          <button
            onClick={() => void run(async () => setState(await disablePush()))}
            disabled={busy}
            className="flex-1 rounded-2xl px-3 py-2 text-[0.8125rem] font-medium disabled:opacity-50"
            style={{ background: "var(--surface-2)", color: "var(--danger)" }}
          >
            Выключить
          </button>
        </div>
      ) : null}

      {note ? (
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--muted)" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Подсказка под «Напомнить» в задаче: напоминание включили, а уведомления
 * на этом телефоне — нет. Без неё человек ждал бы пуш, которого не будет.
 */
export function PushNudge() {
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);

  if (state === null || state === "on") return null;

  return (
    <div className="mt-2 rounded-2xl px-3.5 py-2.5 text-[0.75rem] leading-snug" style={{ background: "var(--surface-2)" }}>
      <span style={{ color: "var(--muted)" }}>
        {state === "off" ? "Уведомления на этом телефоне выключены — напоминание не придёт." : HINTS[state]}
      </span>
      {state === "off" ? (
        <button
          onClick={async () => {
            setBusy(true);
            try {
              setState(await enablePush());
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="mt-1.5 block font-semibold"
          style={{ color: "var(--accent)" }}
        >
          {busy ? "Минуту…" : "Включить уведомления"}
        </button>
      ) : null}
    </div>
  );
}
