"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/lib/icons";
import { FEM_GRADIENT } from "@/lib/fem/cycle";
import { useFem } from "@/components/fem/DataProvider";

/**
 * Ссылка-приглашение партнёра: /fem/join?code=XXXXXXXX. Открыл — сразу
 * подключился и попал на её цикл. Если не вошёл в Dots — сначала вход,
 * код сохраняется в ссылке возврата.
 */
export default function FemJoinPage() {
  return (
    <Suspense>
      <Join />
    </Suspense>
  );
}

function Join() {
  const params = useSearchParams();
  const router = useRouter();
  const { acceptCode } = useFem();
  const [state, setState] = useState<{ ok?: string; error?: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get("code") ?? "";
    if (!code) {
      setState({ error: "В ссылке нет кода приглашения" });
      return;
    }
    acceptCode(code)
      .then((name) => setState({ ok: name }))
      .catch((e: Error) => setState({ error: e.message }));
  }, [acceptCode, params]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center px-6 text-center">
      <span
        className="animate-pop flex h-16 w-16 items-center justify-center rounded-full text-white"
        style={{ background: FEM_GRADIENT, boxShadow: "0 12px 30px -10px rgba(236,72,153,0.6)" }}
      >
        <Icon name={state?.error ? "close" : "flower"} size={32} />
      </span>
      {!state ? (
        <p className="mt-5 text-sm" style={{ color: "var(--muted)" }}>
          Подключаю…
        </p>
      ) : state.ok ? (
        <>
          <h1 className="mt-5 text-[1.375rem] font-semibold">Вы подключены</h1>
          <p className="mt-1.5 text-sm leading-snug" style={{ color: "var(--muted)" }}>
            Теперь вам виден цикл: {state.ok}. Изменить в нём ничего нельзя — только смотреть и поддерживать.
          </p>
          <button
            onClick={() => router.replace("/fem")}
            className="mt-6 w-full rounded-2xl py-3.5 text-[0.9375rem] font-semibold text-white"
            style={{ background: FEM_GRADIENT }}
          >
            Открыть
          </button>
        </>
      ) : (
        <>
          <h1 className="mt-5 text-[1.375rem] font-semibold">Не получилось</h1>
          <p className="mt-1.5 text-sm leading-snug" style={{ color: "var(--muted)" }}>
            {state.error}
          </p>
          <Link href="/fem" replace className="mt-6 text-sm underline" style={{ color: "var(--accent)" }}>
            Ввести код вручную
          </Link>
        </>
      )}
    </div>
  );
}
