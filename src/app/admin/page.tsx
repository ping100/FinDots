"use client";

import Link from "next/link";
import { Icon } from "@/lib/icons";
import { Loader } from "@/components/Loader";
import { Denied, Problem, useOverview } from "@/components/admin/shared";
import { ActivityCard } from "@/components/admin/Tools";
import { AttentionCard, Kpis, SectionTiles, SectionTitle, StatusBanner, UsageLine, useAttention } from "@/components/admin/Pult";

/**
 * «Пульт»: открыл — и сразу видно, всё ли в порядке и что сделать.
 * Сверху плашка (красная, если есть дела; зелёная, если всё хорошо), под
 * ней сами дела с кнопкой действия, потом цифры и разделы со счётчиками.
 */
export default function AdminPage() {
  const { data, denied, problem, busy, reload } = useOverview();
  const { items, loading } = useAttention(data);

  if (denied) return <Denied />;
  if (!data && !problem) return <Loader />;

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <header className="flex items-center gap-2 py-3">
        <Link
          href="/"
          aria-label="На главную"
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full"
          style={{ color: "var(--muted)" }}
        >
          <Icon name="chevron-left" size={20} />
        </Link>
        <h1 className="flex-1 text-[1.75rem] font-extrabold tracking-tight">Админка</h1>
        <button
          onClick={() => location.reload()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.75rem] font-semibold"
          style={{ color: "var(--muted)" }}
          aria-label="Обновить"
        >
          {busy ? "обновляю…" : "обновить"}
          <Icon name="repeat" size={14} />
        </button>
      </header>

      {problem ? <Problem text={problem} /> : null}

      <StatusBanner items={items} loading={loading} />

      {items.length ? (
        <>
          <SectionTitle>Сейчас</SectionTitle>
          {items.map((item) => (
            <AttentionCard key={item.key} item={item} />
          ))}
        </>
      ) : null}

      {data ? (
        <>
          <SectionTitle>Люди</SectionTitle>
          <Kpis data={data} />
          <UsageLine data={data} />
          <div className="mt-2">
            <ActivityCard />
          </div>

          <SectionTitle>Разделы</SectionTitle>
          <SectionTiles data={data} items={items} />

          <p className="mt-6 text-center text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            Данные на {new Date(data.generated_at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
            {" · "}
            <button onClick={reload} className="underline decoration-dotted underline-offset-2">
              обновить цифры
            </button>
          </p>
        </>
      ) : null}
    </div>
  );
}
