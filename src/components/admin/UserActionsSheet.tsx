"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/lib/icons";
import { Button, Sheet, inputClass, inputStyle } from "@/components/ui";
import { SupportComposer, SupportThread } from "@/components/SupportThread";
import { loadThread, sendMessage, type SupportMessage } from "@/lib/support";
import type { AdminUser } from "@/lib/admin";

const WIPE_PHRASE = "ОЧИСТИТЬ";
const DELETE_PHRASE = "УДАЛИТЬ";

/**
 * Действия с одним человеком: доступ по приложениям, блокировка входа,
 * пароль (письмом или напрямую), сообщение от администрации, очистка
 * данных, удаление аккаунта.
 *
 * Опасные действия (очистка, удаление) прячутся за отдельным экраном
 * внутри того же листа — нужно набрать слово своими руками, а не просто
 * подтвердить не глядя. То же слово, что уже стоит на «Начать с чистого
 * листа» в настройках, — для удаления взято другое, чтобы два необратимых
 * действия рядом не путались.
 */
export function UserActionsSheet({
  user,
  onClose,
  onChanged,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [stage, setStage] = useState<"main" | "wipe" | "delete" | "password" | "message">("main");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);

  const close = () => {
    onClose();
    setStage("main");
    setPhrase("");
    setProblem(null);
    setNote(null);
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setProblem(null);
    setNote(null);
    try {
      await fn();
      onChanged();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Не получилось");
    } finally {
      setBusy(null);
    }
  };

  const supabase = createClient();
  const userId = user?.id;

  // Переписка грузится только когда лист открыт на этом экране — не на
  // каждый чих, и заново при переключении на другого человека.
  useEffect(() => {
    if (stage !== "message" || !userId) return;
    let alive = true;
    setMessages(null);
    void loadThread(userId).then((list) => {
      if (alive) setMessages(list);
    });
    return () => {
      alive = false;
    };
  }, [stage, userId]);

  // Действия вызываются только по клику внутри листа, а лист виден только
  // пока user не null, — но для TS это не очевидно, поэтому каждая ловит
  // отсутствие пользователя явным ранним выходом.
  const setAccess = (money: boolean, tasks: boolean) => {
    if (!user) return;
    const id = user.id;
    return run("access", async () => {
      const { error } = await supabase.rpc("admin_set_access", {
        p_user_id: id,
        p_money: money,
        p_tasks: tasks,
      });
      if (error) throw new Error(error.message);
    });
  };

  const setBanned = (banned: boolean) => {
    if (!user) return;
    const id = user.id;
    return run("banned", async () => {
      const { error } = await supabase.rpc("admin_set_banned", { p_user_id: id, p_banned: banned });
      if (error) throw new Error(error.message);
    });
  };

  const sendResetEmail = () => {
    if (!user) return;
    const email = user.email;
    return run("reset", async () => {
      if (!email) throw new Error("У этой учётной записи нет почты");
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/set-password")}`,
      });
      if (error) throw new Error(error.message);
      setNote("Письмо со ссылкой для смены пароля отправлено");
    });
  };

  const setPassword = (newPassword: string) => {
    if (!user) return;
    const id = user.id;
    return run("password", async () => {
      const { error } = await supabase.rpc("admin_set_password", {
        p_user_id: id,
        p_password: newPassword,
      });
      if (error) throw new Error(error.message);
      setStage("main");
      setNote("Пароль сохранён — сообщите его пользователю");
    });
  };

  const wipeData = () => {
    if (!user) return;
    const id = user.id;
    return run("wipe", async () => {
      const { error } = await supabase.rpc("admin_wipe_user_data", { p_user_id: id });
      if (error) throw new Error(error.message);
      setStage("main");
      setPhrase("");
      setNote("База очищена");
    });
  };

  const deleteUser = () => {
    if (!user) return;
    const id = user.id;
    return run("delete", async () => {
      const { error } = await supabase.rpc("admin_delete_user", { p_user_id: id });
      if (error) throw new Error(error.message);
      close();
    });
  };

  const title = user?.display_name || user?.email || "Без имени";
  const canManagePassword = !!user?.providers.includes("email") && !!user?.email;

  const stageTitle =
    stage === "main"
      ? title
      : stage === "wipe"
        ? "Очистить базу"
        : stage === "delete"
          ? "Удалить аккаунт"
          : stage === "password"
            ? "Задать пароль"
            : "Сообщение от администрации";

  return (
    <Sheet
      open={!!user}
      title={stageTitle}
      onClose={close}
      footer={
        stage === "message" && user ? (
          <SupportComposer
            placeholder="Сообщение от администрации"
            onSend={async (body) => {
              const error = await sendMessage(body, user.id);
              if (!error) setMessages(await loadThread(user.id));
              return error;
            }}
          />
        ) : undefined
      }
    >
      {stage === "main" && user ? (
        <div className="space-y-4 pb-2">
          <div className="flex items-center gap-3">
            <Avatar url={user.avatar_url} name={title} size={40} />
            <div className="min-w-0">
              {user.email ? (
                <p className="truncate text-sm" style={{ color: "var(--muted)" }}>
                  {user.email}
                </p>
              ) : null}
              {user.number !== null ? (
                <p className="text-[0.75rem] tabular-nums" style={{ color: "var(--muted)" }}>
                  ID {user.number}
                </p>
              ) : null}
            </div>
          </div>

          {problem ? (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {problem}
            </p>
          ) : null}
          {note ? (
            <p className="text-sm" style={{ color: "var(--ok)" }}>
              {note}
            </p>
          ) : null}

          <div>
            <p className="mb-1.5 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
              Доступ к приложениям
            </p>
            <div className="flex gap-2">
              <AccessChip
                label="Findots"
                on={user.access_money}
                disabled={busy === "access"}
                onClick={() => setAccess(!user.access_money, user.access_tasks)}
              />
              <AccessChip
                label="Todots"
                on={user.access_tasks}
                disabled={busy === "access"}
                onClick={() => setAccess(user.access_money, !user.access_tasks)}
              />
            </div>
          </div>

          <div
            className="overflow-hidden rounded-2xl"
            style={{ border: "1px solid var(--border)" }}
          >
            <ActionRow
              label={user.banned ? "Разблокировать вход" : "Заблокировать вход"}
              hint={user.banned ? "Сейчас не может войти" : "Данные останутся, войти будет нельзя"}
              danger={!user.banned}
              busy={busy === "banned"}
              onClick={() => setBanned(!user.banned)}
            />
            {canManagePassword ? (
              <>
                <ActionRow
                  label="Сбросить пароль"
                  hint="Отправить письмо со ссылкой для смены пароля"
                  busy={busy === "reset"}
                  onClick={sendResetEmail}
                  first={false}
                />
                <ActionRow
                  label="Задать пароль"
                  hint="Придумать пароль самому и сообщить пользователю — письмо не отправляется"
                  busy={busy === "password"}
                  onClick={() => setStage("password")}
                  first={false}
                />
              </>
            ) : null}
            <ActionRow
              label="Написать сообщение"
              hint="Придёт как сообщение от администрации, с уведомлением"
              onClick={() => setStage("message")}
              first={false}
            />
          </div>

          <div>
            <p className="mb-1.5 text-[0.8125rem]" style={{ color: "var(--danger)" }}>
              Опасно
            </p>
            <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--danger)" }}>
              <ActionRow
                label="Очистить базу"
                hint="Удалить все кошельки, категории, операции и задачи — насовсем"
                danger
                onClick={() => setStage("wipe")}
              />
              <ActionRow
                label="Удалить аккаунт"
                hint="Учётная запись и все данные исчезнут без возможности восстановить"
                danger
                onClick={() => setStage("delete")}
              />
            </div>
          </div>
        </div>
      ) : stage === "wipe" || stage === "delete" ? (
        <ConfirmStage
          phraseNeeded={stage === "wipe" ? WIPE_PHRASE : DELETE_PHRASE}
          description={
            stage === "wipe"
              ? `Удалятся насовсем: кошельки, накопления, долги, категории, операции и задачи «${title}». Аккаунт и вход не тронем.`
              : `Учётная запись «${title}», вход и все данные исчезнут навсегда. Отменить нельзя.`
          }
          submitLabel={stage === "wipe" ? "Очистить базу насовсем" : "Удалить аккаунт насовсем"}
          phrase={phrase}
          setPhrase={setPhrase}
          busy={busy === "wipe" || busy === "delete"}
          problem={problem}
          onBack={() => {
            setStage("main");
            setPhrase("");
            setProblem(null);
          }}
          onSubmit={stage === "wipe" ? wipeData : deleteUser}
        />
      ) : stage === "password" ? (
        <PasswordStage
          busy={busy === "password"}
          problem={problem}
          onBack={() => {
            setStage("main");
            setProblem(null);
          }}
          onSubmit={setPassword}
        />
      ) : stage === "message" && user ? (
        <div>
          <button
            onClick={() => setStage("main")}
            className="mb-2 flex items-center gap-1 text-sm"
            style={{ color: "var(--muted)" }}
          >
            <Icon name="chevron-left" size={16} />
            Назад
          </button>
          {messages === null ? (
            <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
              Загружаю…
            </p>
          ) : (
            <SupportThread messages={messages} mineIsAdmin empty="Сообщений ещё не было." />
          )}
        </div>
      ) : null}
    </Sheet>
  );
}

function AccessChip({
  label,
  on,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className="flex-1 rounded-2xl border px-3 py-2.5 text-sm font-medium disabled:opacity-50"
      style={{
        borderColor: on ? "var(--accent)" : "var(--border)",
        background: on ? "var(--surface-2)" : "transparent",
        color: on ? "var(--text)" : "var(--muted)",
      }}
    >
      {label} {on ? "включён" : "выключен"}
    </button>
  );
}

function ActionRow({
  label,
  hint,
  danger,
  busy,
  onClick,
  first = true,
}: {
  label: string;
  hint: string;
  danger?: boolean;
  busy?: boolean;
  onClick: () => void;
  first?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-50"
      style={!first ? { borderTop: "1px solid var(--border)" } : undefined}
    >
      <span className="flex-1">
        <span className="block text-[0.9375rem]" style={{ color: danger ? "var(--danger)" : undefined }}>
          {busy ? "Выполняю…" : label}
        </span>
        <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
      </span>
    </button>
  );
}

function ConfirmStage({
  phraseNeeded,
  description,
  submitLabel,
  phrase,
  setPhrase,
  busy,
  problem,
  onBack,
  onSubmit,
}: {
  phraseNeeded: string;
  description: string;
  submitLabel: string;
  phrase: string;
  setPhrase: (v: string) => void;
  busy: boolean;
  problem: string | null;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-3 pb-2">
      <p className="text-sm leading-snug">{description}</p>

      <div>
        <label className="mb-1.5 block text-sm" style={{ color: "var(--muted)" }}>
          Наберите «{phraseNeeded}», чтобы разрешить
        </label>
        <input
          className={inputClass}
          style={inputStyle}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder={phraseNeeded}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
        />
      </div>

      {problem ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}

      <Button
        variant="danger"
        onClick={onSubmit}
        disabled={busy || phrase.trim().toUpperCase() !== phraseNeeded}
      >
        {busy ? "Выполняю…" : submitLabel}
      </Button>
      <Button variant="ghost" onClick={onBack} disabled={busy}>
        Назад
      </Button>
    </div>
  );
}

/** Пароль вводит сам админ — письмо никуда не уходит, человеку говорят лично. */
function PasswordStage({
  busy,
  problem,
  onBack,
  onSubmit,
}: {
  busy: boolean;
  problem: string | null;
  onBack: () => void;
  onSubmit: (password: string) => void;
}) {
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const valid = value.length >= 6;

  return (
    <div className="space-y-3 pb-2">
      <p className="text-sm leading-snug" style={{ color: "var(--muted)" }}>
        Пользователь сможет войти этим паролем сразу же — письмо не
        отправляется, сообщите пароль лично.
      </p>

      <div>
        <label className="mb-1.5 block text-sm" style={{ color: "var(--muted)" }}>
          Новый пароль
        </label>
        <div className="relative">
          <input
            type={shown ? "text" : "password"}
            className={`${inputClass} pr-12`}
            style={inputStyle}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Минимум 6 символов"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? "Скрыть пароль" : "Показать пароль"}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center opacity-55 transition active:scale-90 active:opacity-100"
          >
            <Icon name={shown ? "eye-off" : "eye"} size={18} />
          </button>
        </div>
      </div>

      {problem ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {problem}
        </p>
      ) : null}

      <Button onClick={() => onSubmit(value)} disabled={busy || !valid}>
        {busy ? "Сохраняю…" : "Сохранить пароль"}
      </Button>
      <Button variant="ghost" onClick={onBack} disabled={busy}>
        Назад
      </Button>
    </div>
  );
}
