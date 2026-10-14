"use client";

import { Loader } from "@/components/Loader";
import { Denied, Problem } from "@/components/admin/shared";
import { AdminHeader, LinkCard, useAdminRpc } from "@/components/admin/Tools";

interface Funnel {
  registered: number;
  money: number;
  tasks: number;
  fem: number;
  first_record: number;
  came_back: number;
  two_weeks: number;
  two_weeks_base: number;
}
interface Cohort {
  week: string;
  size: number;
  d1: number;
  d1_base: number;
  d7: number;
  d7_base: number;
  d30: number;
  d30_base: number;
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/**
 * Рост: путь новичка (где люди теряются) и удержание (возвращаются ли).
 * Главные вопросы продукта — нужно ли приложение людям и что упростить.
 */
export default function GrowthPage() {
  const funnel = useAdminRpc<Funnel>("admin_funnel");
  const cohorts = useAdminRpc<Cohort[]>("admin_retention");
  if (funnel.denied || cohorts.denied) return <Denied />;
  if (!funnel.data && !funnel.problem) return <Loader />;
  const f = funnel.data;

  const steps = f
    ? [
        { label: "Зарегистрировались", value: f.registered, of: f.registered },
        { label: "Сделали первую запись", value: f.first_record, of: f.registered },
        { label: "Вернулись в другой день", value: f.came_back, of: f.registered },
        { label: "Пользуются 2 недели и дольше", value: f.two_weeks, of: f.two_weeks_base, note: f.two_weeks_base < f.registered ? `из ${f.two_weeks_base}, кто с нами уже 2 недели` : undefined },
      ]
    : [];
  const worst = steps.slice(1).reduce<{ label: string; drop: number } | null>((acc, s, i) => {
    const prev = steps[i];
    const drop = pct(prev.value, prev.of) - pct(s.value, s.of);
    return !acc || drop > acc.drop ? { label: s.label, drop } : acc;
  }, null);

  return (
    <div className="pt-safe mx-auto w-full max-w-md px-4 pb-16">
      <AdminHeader title="Рост" busy={funnel.busy} onRefresh={() => (funnel.reload(), cohorts.reload())} />
      {funnel.problem ? <Problem text={funnel.problem} /> : null}

      <h2 className="mb-2 px-1 text-[0.9375rem] font-semibold">Путь новичка · за 90 дней</h2>
      <div className="rounded-2xl p-4" style={{ background: "var(--surface)" }}>
        {steps.map((s) => (
          <div key={s.label} className="[&:not(:first-child)]:mt-3">
            <div className="flex items-baseline justify-between gap-2 text-[0.8125rem]">
              <span>{s.label}</span>
              <span className="shrink-0 font-semibold tabular-nums">
                {s.value} <span style={{ color: "var(--muted)" }}>· {pct(s.value, s.of)}%</span>
              </span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct(s.value, s.of))}%`, background: "linear-gradient(90deg, #06b6d4, #7c3aed)" }} />
            </div>
            {s.note ? (
              <p className="mt-0.5 text-[0.625rem]" style={{ color: "var(--muted)" }}>
                {s.note}
              </p>
            ) : null}
          </div>
        ))}
        {f ? (
          <p className="mt-3 text-[0.75rem] leading-snug" style={{ color: "var(--muted)" }}>
            С чего начинают: Findots — {f.money}, Todots — {f.tasks}, FemDots — {f.fem}.
            {worst && worst.drop > 0 ? ` Больше всего теряем на шаге «${worst.label.toLowerCase()}» — его стоит упростить.` : ""}
          </p>
        ) : null}
      </div>

      <h2 className="mb-2 mt-6 px-1 text-[0.9375rem] font-semibold">Удержание по неделям регистрации</h2>
      <div className="overflow-hidden rounded-2xl" style={{ background: "var(--surface)" }}>
        <div className="grid grid-cols-[1.4fr_0.7fr_1fr_1fr_1fr] gap-1 px-3.5 py-2 text-[0.625rem] font-semibold" style={{ color: "var(--muted)" }}>
          <span>Неделя</span>
          <span className="text-right">Новых</span>
          <span className="text-right">На след. день</span>
          <span className="text-right">Через неделю</span>
          <span className="text-right">Через месяц</span>
        </div>
        {(cohorts.data ?? []).map((c) => (
          <div
            key={c.week}
            className="grid grid-cols-[1.4fr_0.7fr_1fr_1fr_1fr] gap-1 px-3.5 py-2 text-[0.8125rem] tabular-nums"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <span>{new Date(c.week + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
            <span className="text-right">{c.size}</span>
            <Cell n={c.d1} base={c.d1_base} />
            <Cell n={c.d7} base={c.d7_base} />
            <Cell n={c.d30} base={c.d30_base} />
          </div>
        ))}
        {cohorts.data && cohorts.data.length === 0 ? (
          <p className="px-3.5 py-3 text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            За последние 10 недель регистраций не было
          </p>
        ) : null}
      </div>
      <p className="mt-2 px-1 text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
        Доля новичков недели, которые снова открыли приложение: на следующий день, на 7–13-й и на 28–34-й день.
        Прочерк — этот срок ещё не наступил. Точные отметки о заходах копятся с 14 октября; до этого — по дням, когда
        человек что-то записывал. Хорошо для приложений-привычек: на следующий день — от 40%, через месяц — от 20%.
      </p>
      <div className="mt-5">
        <LinkCard href="/admin/features" icon="star" color="#ec4899" title="Функции" caption="Чем реально пользуются, а что не нужно" />
      </div>
    </div>
  );
}

function Cell({ n, base }: { n: number; base: number }) {
  if (base === 0) return <span className="text-right" style={{ color: "var(--muted)" }}>—</span>;
  const p = pct(n, base);
  const color = p >= 40 ? "#16a34a" : p >= 20 ? "#d97706" : "#dc2626";
  return (
    <span className="text-right font-semibold" style={{ color }}>
      {p}%
    </span>
  );
}
