"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "./DataProvider";
import { Button, Sheet, inputClass, inputStyle } from "./ui";

/** Слово, которое нужно вписать, чтобы разрешить удаление. */
const PHRASE = "УДАЛИТЬ";

/**
 * Начать с чистого листа: удаляет все кошельки, категории и операции
 * насовсем. Учётная запись, вход и настройки (валюта, тема, ключ ИИ)
 * не трогаются.
 *
 * Дело необратимое и на весь список сразу, поэтому одного нажатия мало —
 * слово нужно набрать своими руками, а не просто подтвердить не глядя.
 */
export function ResetMoneyData() {
  const { resetMoneyData } = useStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setPhrase("");
    setProblem(null);
  };

  const submit = async () => {
    if (phrase.trim().toUpperCase() !== PHRASE || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await resetMoneyData();
      close();
      router.push("/money");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left [&:not(:first-child)]:border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="flex-1">
          <span className="block text-[0.9375rem]" style={{ color: "var(--danger)" }}>
            Начать с чистого листа
          </span>
          <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
            Удалить все кошельки, категории и операции насовсем
          </span>
        </span>
      </button>

      <Sheet open={open} title="Начать с чистого листа" onClose={close}>
        <div className="space-y-3 pb-2">
          <p className="text-sm leading-snug">
            Удалятся насовсем: все кошельки, накопления, долги, категории и операции. Обратно
            их не вернуть — ни отменить, ни восстановить из корзины, потому что корзины нет.
          </p>
          <p className="text-sm leading-snug" style={{ color: "var(--muted)" }}>
            Не тронем: вход, почту и пароль, валюту, тему, ключ OpenRouter — и задачи в другом
            приложении, если пользуетесь им тоже.
          </p>
          <p className="text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            Если нужна история — сначала выгрузите операции в CSV, строкой выше в «Данных».
          </p>

          <div>
            <label className="mb-1.5 block text-sm" style={{ color: "var(--muted)" }}>
              Наберите «{PHRASE}», чтобы разрешить удаление
            </label>
            <input
              className={inputClass}
              style={inputStyle}
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={PHRASE}
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
            onClick={submit}
            disabled={busy || phrase.trim().toUpperCase() !== PHRASE}
          >
            {busy ? "Удаляю…" : "Удалить всё насовсем"}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
