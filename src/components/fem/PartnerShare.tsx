"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/lib/icons";
import { FEM_GRADIENT } from "@/lib/fem/cycle";
import { Switch, inputClass, inputStyle } from "@/components/ui";
import { useFem } from "./DataProvider";

const linkFor = (code: string) =>
  `${typeof window !== "undefined" ? window.location.origin : "https://dotsapp.vercel.app"}/fem/join?code=${code}`;

/**
 * Партнёрский режим в настройках владелицы: пригласить, видеть, кто
 * подключён, решить, что ему показывать, и отключить в любой момент.
 */
export function PartnerShare() {
  const { share, createShare, updateShare, revokeShare, shareOptions, setShareOptions, settings } = useFem();
  const pills = settings?.method === "coc" || settings?.method === "pop";
  const [mood, setMood] = useState(share?.share_mood ?? false);
  const [symptoms, setSymptoms] = useState(share?.share_symptoms ?? false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const toggles = (
    <div className="mt-3 overflow-hidden rounded-2xl" style={{ background: "var(--surface-2)" }}>
      <Toggle
        title="Показывать настроение"
        on={mood}
        onChange={(v) => {
          setMood(v);
          if (share) void updateShare(v, symptoms);
        }}
      />
      <Toggle
        title="Показывать самочувствие"
        hint="Сегодняшние симптомы и прогноз «завтра возможно» с подсказкой, как помочь"
        on={symptoms}
        onChange={(v) => {
          setSymptoms(v);
          if (share) void updateShare(mood, v);
        }}
        divided
      />
      {share && shareOptions ? (
        <>
          <Toggle
            title="Показывать статус дня"
            hint="«Обними меня», «Устала» — вы выбираете во вкладке «Вместе»"
            on={shareOptions.share_status}
            onChange={(v) => void setShareOptions({ ...shareOptions, share_status: v })}
            divided
          />
          <Toggle
            title="Показывать «Планируем беременность»"
            hint="Партнёр увидит лучшие дни для зачатия"
            on={shareOptions.share_goal}
            onChange={(v) => void setShareOptions({ ...shareOptions, share_goal: v })}
            divided
          />
          {pills ? (
            <Toggle
              title="Напомнить партнёру про таблетку"
              hint="Если через 2 часа после времени приёма она не отмечена"
              on={shareOptions.pill_nudge}
              onChange={(v) => void setShareOptions({ ...shareOptions, pill_nudge: v })}
              divided
            />
          ) : null}
        </>
      ) : null}
    </div>
  );

  if (!share) {
    return (
      <div className="fem-card mb-4 rounded-3xl p-4">
        <p className="text-[0.9375rem] font-semibold">Пригласить партнёра</p>
        <p className="mt-1 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
          Он увидит ваш цикл: фазу, когда месячные и фертильное окно, — и подсказки, как поддержать. А вы сможете
          одним нажатием попросить заботы или шоколадку и видеть, как он отвечает. Менять ваши данные он не может —
          только предложить отметку близости, которую подтвердите вы. Отключить можно в любой момент.
        </p>
        {toggles}
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await createShare(mood, symptoms);
            setBusy(false);
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[0.9375rem] font-semibold text-white disabled:opacity-60"
          style={{ background: FEM_GRADIENT, boxShadow: "0 10px 24px -12px rgba(236,72,153,0.7)" }}
        >
          <Icon name="heart" size={17} />
          {busy ? "Минуту…" : "Пригласить"}
        </button>
      </div>
    );
  }

  const link = linkFor(share.code);
  // Главное — просто код: скопировала, вставила в любой мессенджер.
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(share.code);
      setNote("Код скопирован — вставьте его в сообщение партнёру");
    } catch {
      setNote("Не получилось скопировать — продиктуйте код");
    }
  };
  const send = async () => {
    setNote(null);
    const text = `Приглашаю в FemDots — так ты будешь видеть мой цикл: ${link}`;
    try {
      if (navigator.share) await navigator.share({ title: "FemDots", text });
      else {
        await navigator.clipboard.writeText(text);
        setNote("Ссылка скопирована — отправьте её в мессенджер");
      }
    } catch {
      // Закрыли окно «Поделиться» — ничего страшного.
    }
  };

  return (
    <div className="fem-card mb-4 rounded-3xl p-4">
      {share.partner_name ? (
        <>
          <p className="flex items-center gap-2 text-[0.9375rem] font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: FEM_GRADIENT }}>
              <Icon name="heart" size={14} />
            </span>
            Подключён: {share.partner_name}
          </p>
          <p className="mt-1 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
            Видит ваш цикл и прогноз. Ниже — что ещё ему показывать.
          </p>
        </>
      ) : (
        <>
          <p className="text-[0.9375rem] font-semibold">Приглашение готово</p>
          <p className="mt-1 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
            Скопируйте код и отправьте партнёру. Он введёт его в FemDots: «Кто вы?» → «Я мужчина».
          </p>
          <button
            onClick={copyCode}
            aria-label="Скопировать код"
            className="mt-3 block w-full rounded-2xl py-3 text-center text-[1.5rem] font-bold tracking-[0.25em] tabular-nums transition active:scale-[0.98]"
            style={{ background: "var(--surface-2)" }}
          >
            {share.code}
          </button>
          <button
            onClick={copyCode}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[0.9375rem] font-semibold text-white"
            style={{ background: FEM_GRADIENT }}
          >
            <Icon name="note" size={17} />
            Скопировать код
          </button>
          <button
            onClick={send}
            className="mt-1.5 flex w-full items-center justify-center gap-1.5 py-1.5 text-[0.8125rem]"
            style={{ color: "var(--muted)" }}
          >
            <Icon name="share" size={14} />
            или отправить ссылкой
          </button>
          {note ? (
            <p className="mt-1.5 text-center text-[0.75rem]" style={{ color: "var(--muted)" }}>
              {note}
            </p>
          ) : null}
        </>
      )}
      {toggles}
      <button
        onClick={async () => {
          if (!confirm) {
            setConfirm(true);
            return;
          }
          await revokeShare();
          setConfirm(false);
        }}
        className="mt-3 w-full rounded-2xl py-2.5 text-sm font-medium"
        style={{ color: confirm ? "#fff" : "var(--danger)", background: confirm ? "var(--danger)" : "transparent" }}
      >
        {confirm
          ? "Нажмите ещё раз — подтвердить"
          : share.partner_name
            ? "Отключить партнёра"
            : "Отменить приглашение"}
      </button>
    </div>
  );
}

/** «Я партнёр»: ввести код девушки — или перейти к её циклу, если уже подключён. */
export function PartnerJoin() {
  const { partner, acceptCode } = useFem();
  const [code, setCode] = useState("");
  const [state, setState] = useState<{ busy?: boolean; error?: string } | null>(null);

  if (partner) {
    return (
      <Link href="/fem/partner" className="fem-card mb-4 flex items-center gap-3 rounded-3xl px-4 py-3.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: FEM_GRADIENT }}>
          <Icon name="heart" size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem]">Цикл: {partner.owner_name}</span>
          <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            Вы подключены как партнёр
          </span>
        </span>
        <Icon name="chevron-right" size={16} className="opacity-30" />
      </Link>
    );
  }

  return (
    <div className="fem-card mb-4 rounded-3xl p-4">
      <p className="text-[0.9375rem] font-semibold">Есть код от партнёрши?</p>
      <p className="mt-1 text-[0.8125rem] leading-snug" style={{ color: "var(--muted)" }}>
        Введите его — и увидите её цикл.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          className={`${inputClass} uppercase tracking-[0.2em]`}
          style={inputStyle}
          value={code}
          maxLength={8}
          placeholder="ABCD2345"
          onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())}
        />
        <button
          disabled={code.length < 8 || state?.busy}
          onClick={async () => {
            setState({ busy: true });
            try {
              await acceptCode(code);
              setState(null);
            } catch (e) {
              setState({ error: e instanceof Error ? e.message : "Не получилось подключиться" });
            }
          }}
          className="shrink-0 rounded-2xl px-4 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: FEM_GRADIENT }}
        >
          ОК
        </button>
      </div>
      {state?.error ? (
        <p className="mt-2 text-[0.75rem]" style={{ color: "var(--danger)" }}>
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

function Toggle({
  title,
  hint,
  on,
  onChange,
  divided,
}: {
  title: string;
  hint?: string;
  on: boolean;
  onChange: (on: boolean) => void;
  divided?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderTop: divided ? "1px solid var(--border)" : undefined }}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{title}</span>
        {hint ? (
          <span className="block text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            {hint}
          </span>
        ) : null}
      </span>
      <Switch checked={on} onChange={onChange} label={title} />
    </div>
  );
}
