"use client";

import { useRef, useState } from "react";
import { Icon } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import type { InsightItem, Insights } from "@/lib/reportInsights";
import type { CurrencyCode } from "@/lib/types";

/**
 * Верх «Отчёта»: яркие карточки-истории с главными выводами месяца
 * (листаются пальцем), плитки «обычно / этот месяц / отложили / без трат»,
 * траты по месяцам, частые покупки, дни недели, крупные и регулярные траты.
 * Расчёты — lib/reportInsights.ts.
 */
export function ReportInsights({ data, base, current }: { data: Insights; base: CurrencyCode; current: boolean }) {
  const money = (v: number) => formatMoney(Math.round(v), base);
  const vsUsual = data.usual && data.usual.toDate > 0 ? (data.spent - data.usual.toDate) / data.usual.toDate : null;
  const saved = data.earned - data.spent;

  return (
    <>
      <Stories data={data} base={base} current={current} />

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <Tile
          label="Обычно за месяц"
          value={data.usual ? money(data.usual.month) : "—"}
          note={data.usual ? `в среднем за ${data.usual.months} ${plural(data.usual.months, "месяц", "месяца", "месяцев")}` : "появится через месяц"}
        />
        <Tile
          label={current ? "Этот месяц" : "За месяц"}
          value={money(data.spent)}
          note={
            vsUsual == null
              ? current
                ? `за ${data.days} ${plural(data.days, "день", "дня", "дней")}`
                : "сравнить пока не с чем"
              : Math.abs(vsUsual) < 0.05
                ? "как обычно"
                : `${vsUsual > 0 ? "↑" : "↓"} ${Math.round(Math.abs(vsUsual) * 100)}% к обычному${current ? ` на ${data.cutoff}-е` : ""}`
          }
          tone={vsUsual == null || Math.abs(vsUsual) < 0.05 ? undefined : vsUsual > 0 ? "bad" : "good"}
        />
        <Tile
          label="Отложили"
          value={data.earned > 0 ? `${Math.max(0, Math.round((saved / data.earned) * 100))}%` : "—"}
          note={
            data.earned <= 0
              ? "доходов не было"
              : saved >= 0
                ? `от дохода · ${money(saved)}`
                : `потратили больше на ${money(-saved)}`
          }
          tone={data.earned > 0 ? (saved >= 0 ? "good" : "bad") : undefined}
        />
        <Tile
          label="Дней без трат"
          value={
            <>
              {data.noSpend.days}
              <span className="text-[0.875rem] font-semibold" style={{ color: "var(--muted)" }}>
                {" "}из {data.days}
              </span>
            </>
          }
          note={data.noSpend.prev != null ? `в ${data.noSpend.prevMonth} было ${data.noSpend.prev}` : " "}
        />
      </div>

      <MonthsCard data={data} base={base} />

      {data.frequent.length ? (
        <Card title="Самые частые покупки" aside="за месяц">
          <Rows
            items={data.frequent.map((f) => ({
              ...f,
              caption: `${f.count} ${plural(f.count, "раз", "раза", "раз")} · в среднем ${money(f.avg)}`,
            }))}
            base={base}
          />
        </Card>
      ) : null}

      {data.weekdays ? <WeekCard days={data.weekdays} base={base} /> : null}

      {data.biggest.length ? (
        <Card title="Крупные траты">
          <Rows items={data.biggest} base={base} />
        </Card>
      ) : null}

      {data.regular.length ? (
        <Card title="Регулярные платежи" aside={`${money(data.regular.reduce((s, r) => s + r.amount, 0))} в месяц`}>
          <Rows items={data.regular} base={base} />
          <p className="mt-1.5 text-[0.75rem]" style={{ color: "var(--muted)" }}>
            За год это {money(data.regular.reduce((s, r) => s + r.amount, 0) * 12)}
          </p>
        </Card>
      ) : null}
    </>
  );
}

// ─────────────────────────── истории ───────────────────────────

const GRADIENTS = [
  "linear-gradient(150deg, #059669, #06b6d4 70%, #6366f1)",
  "linear-gradient(150deg, #f97316, #ec4899)",
  "linear-gradient(150deg, #8b5cf6, #ec4899 110%)",
  "linear-gradient(150deg, #2563eb, #06b6d4)",
  "linear-gradient(150deg, #f59e0b, #ef4444)",
];

function Stories({ data, base, current }: { data: Insights; base: CurrencyCode; current: boolean }) {
  const money = (v: number) => formatMoney(Math.round(v), base);
  const [page, setPage] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  const cards: { kicker: string; title: string; text: string }[] = [];
  const u = data.usual;
  if (u && u.toDate > 0 && data.spent > 0) {
    const delta = (data.spent - u.toDate) / u.toDate;
    const pct = Math.round(Math.abs(delta) * 100);
    cards.push({
      kicker: current ? "Этот месяц" : "Итог месяца",
      title:
        Math.abs(delta) < 0.05
          ? current ? "Тратите как обычно" : "Потратили как обычно"
          : `${current ? "Тратите" : "Потратили"} на ${pct}% ${delta > 0 ? "больше" : "меньше"} обычного`,
      text: current
        ? `${money(data.spent)} к ${data.cutoff}-му числу — обычно к этой дате уходит ${money(u.toDate)}`
        : `${money(data.spent)} за месяц — обычно ${money(u.month)}`,
    });
  } else if (data.spent > 0) {
    cards.push({
      kicker: current ? "Этот месяц" : "Итог месяца",
      title: `Потрачено ${money(data.spent)}`,
      text: `В среднем ${money(data.spent / data.days)} в день. Через месяц здесь появится сравнение с вашим обычным месяцем.`,
    });
  }
  const top = data.frequent[0];
  if (top && top.count >= 3) {
    cards.push({
      kicker: "Привычка",
      title: `${top.name} — ${top.count} ${plural(top.count, "раз", "раза", "раз")} за месяц`,
      text: `≈ ${money((top.amount / data.days) * 365)} в год при таком темпе`,
    });
  }
  if (data.rise) {
    const r = data.rise;
    cards.push(
      r.delta == null
        ? {
            kicker: "Новое в этом месяце",
            title: `${r.name} — ${money(r.now)}`,
            text: "Раньше на это почти не тратили",
          }
        : {
            kicker: "Что выросло",
            title: `${r.name}: +${Math.min(999, Math.round(r.delta * 100))}% к обычному`,
            text: `${money(r.now)} — обычно ${current ? "к этой дате " : ""}${money(r.usual)}`,
          },
    );
  }
  if (data.earned > 0) {
    const saved = data.earned - data.spent;
    cards.push(
      saved >= 0
        ? {
            kicker: "Сбережения",
            title: `${current ? "Отложено" : "Отложили"} ${Math.round((saved / data.earned) * 100)}% дохода`,
            text: `${money(saved)} из ${money(data.earned)}`,
          }
        : {
            kicker: "Сбережения",
            title: "Трат больше, чем доходов",
            text: `на ${money(-saved)} — разница ушла из прошлых запасов`,
          },
    );
  }
  if (data.priciestDay) {
    const d = data.priciestDay;
    const { from } = monthOfInsights(data);
    cards.push({
      kicker: "Самый дорогой день",
      title: new Date(from.getFullYear(), from.getMonth(), d.day).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }),
      text: `${money(d.amount)}${d.category ? ` · больше всего на «${d.category}»` : ""}`,
    });
  }
  if (!cards.length) return null;

  const onScroll = () => {
    const el = strip.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const step = card ? card.offsetWidth + 10 : el.clientWidth;
    setPage(Math.round(el.scrollLeft / step));
  };

  return (
    <div className="mb-1">
      <div
        ref={strip}
        onScroll={onScroll}
        className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((c, i) => (
          <div
            key={c.kicker}
            className="relative flex h-[11.5rem] w-[82%] shrink-0 snap-center flex-col overflow-hidden rounded-[1.625rem] p-4 text-white"
            style={{ background: GRADIENTS[i % GRADIENTS.length], boxShadow: "0 16px 32px -20px rgba(15,23,42,0.6)" }}
          >
            <span
              aria-hidden
              className="absolute -right-16 -top-20 h-52 w-52 rounded-full"
              style={{ background: "rgba(255,255,255,0.15)" }}
            />
            <span className="relative text-[0.6875rem] font-semibold uppercase tracking-wider opacity-85">{c.kicker}</span>
            <span className="relative mt-2 text-[1.375rem] font-extrabold leading-tight tracking-tight">{c.title}</span>
            <span className="relative mt-auto text-[0.8125rem] leading-snug opacity-90">{c.text}</span>
          </div>
        ))}
      </div>
      {cards.length > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {cards.map((c, i) => (
            <span
              key={c.kicker}
              className="h-1.5 rounded-full transition-all"
              style={{ width: i === page ? 18 : 6, background: i === page ? "var(--accent)" : "var(--border)" }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Начало выбранного месяца: последний столбик «по месяцам» — он и есть. */
function monthOfInsights(data: Insights): { from: Date } {
  const now = new Date();
  const shift = Number(data.months[data.months.length - 1]?.key ?? 0);
  return { from: new Date(now.getFullYear(), now.getMonth() + shift, 1) };
}

// ─────────────────────────── карточки ───────────────────────────

function Tile({ label, value, note, tone }: { label: string; value: React.ReactNode; note: string; tone?: "good" | "bad" }) {
  return (
    <div className="money-card min-w-0 rounded-[1.25rem] px-3 py-2.5">
      <p className="text-[0.6875rem]" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <p className="truncate text-[1.25rem] font-extrabold leading-tight tracking-tight tabular-nums">{value}</p>
      <p
        className="truncate text-[0.6875rem] font-medium"
        style={{ color: tone === "bad" ? "var(--danger)" : tone === "good" ? "#059669" : "var(--muted)" }}
      >
        {note}
      </p>
    </div>
  );
}

function Card({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section className="money-card mt-3 rounded-[1.375rem] px-3.5 pb-3 pt-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h2 className="text-[0.9375rem] font-bold">{title}</h2>
        {aside ? (
          <span className="text-[0.75rem] tabular-nums" style={{ color: "var(--muted)" }}>
            {aside}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Rows({ items, base }: { items: InsightItem[]; base: CurrencyCode }) {
  return (
    <div>
      {items.map((x, i) => (
        <div
          key={x.key}
          className="flex items-center gap-2.5 py-2"
          style={{ borderTop: i ? "1px solid var(--border)" : undefined }}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: x.color }}
          >
            <Icon name={x.icon} size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.875rem] font-semibold">{x.name}</span>
            <span className="block truncate text-[0.6875rem]" style={{ color: "var(--muted)" }}>
              {x.caption}
            </span>
          </span>
          <span className="shrink-0 text-[0.875rem] font-bold tabular-nums">{formatMoney(Math.round(x.amount), base)}</span>
        </div>
      ))}
    </div>
  );
}

/** Полгода столбиками; пунктир — обычный месяц. Выбранный — цветом. */
function MonthsCard({ data, base }: { data: Insights; base: CurrencyCode }) {
  const active = data.months.filter((m) => m.value > 0);
  if (active.length < 2) return null;
  const avg = data.usual?.month ?? 0;
  const top = Math.max(avg, ...data.months.map((m) => m.value)) * 1.08 || 1;
  const H = 92;
  const income = data.usual?.income ?? 0;
  return (
    <Card title="Траты по месяцам" aside={avg ? `обычно ${formatMoney(Math.round(avg), base)}` : undefined}>
      <div className="relative mt-2 flex items-end gap-2" style={{ height: H + 18 }}>
        {avg ? (
          <span
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed"
            style={{ bottom: 18 + (avg / top) * H, borderColor: "var(--muted)", opacity: 0.7 }}
          />
        ) : null}
        {data.months.map((m) => (
          <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span
              className="w-full rounded-t-lg rounded-b-sm"
              title={formatMoney(Math.round(m.value), base)}
              style={{
                height: Math.max(3, (m.value / top) * H),
                background: m.selected ? "linear-gradient(#10b981, #06b6d4)" : "var(--surface-2)",
                opacity: m.partial && !m.selected ? 0.6 : 1,
              }}
            />
            <span
              className="text-[0.625rem]"
              style={{ color: m.selected ? "var(--text)" : "var(--muted)", fontWeight: m.selected ? 700 : 400 }}
            >
              {m.label}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
        {avg ? "Пунктир — ваш обычный месяц. " : ""}
        {data.months[data.months.length - 1]?.partial ? "Этот месяц ещё идёт. " : ""}
        {income > 0 && avg > 0
          ? `Доходы в среднем ${formatMoney(Math.round(income), base)} — ${
              income > avg ? `откладываете около ${Math.round(((income - avg) / income) * 100)}%` : "тратите всё, что приходит"
            }`
          : ""}
      </p>
    </Card>
  );
}

function WeekCard({ days, base }: { days: { label: string; avg: number }[]; base: CurrencyCode }) {
  const top = Math.max(...days.map((d) => d.avg)) || 1;
  const peak = days.findIndex((d) => d.avg === top);
  const weekday = days.slice(0, 5).reduce((s, d) => s + d.avg, 0) / 5;
  const weekend = (days[5].avg + days[6].avg) / 2;
  const FULL = ["понедельникам", "вторникам", "средам", "четвергам", "пятницам", "субботам", "воскресеньям"];
  return (
    <Card title="Когда вы тратите" aside="за 3 месяца">
      <div className="mt-2 flex h-[5.5rem] items-end gap-2">
        {days.map((d, i) => (
          <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span
              className="w-full rounded-t-lg rounded-b-sm"
              title={formatMoney(Math.round(d.avg), base)}
              style={{
                height: Math.max(3, (d.avg / top) * 64),
                background: i === peak ? "linear-gradient(#10b981, #06b6d4)" : "var(--surface-2)",
              }}
            />
            <span className="text-[0.625rem]" style={{ color: i === peak ? "var(--text)" : "var(--muted)", fontWeight: i === peak ? 700 : 400 }}>
              {d.label}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
        Больше всего — по {FULL[peak]}, в среднем {formatMoney(Math.round(top), base)}. В будни —{" "}
        {formatMoney(Math.round(weekday), base)} в день, в выходные — {formatMoney(Math.round(weekend), base)}.
      </p>
    </Card>
  );
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
