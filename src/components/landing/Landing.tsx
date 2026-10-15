import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/lib/icons";
import { Logo } from "@/components/Logo";
import { APPS } from "@/lib/apps";
import { HomeSky } from "@/components/home/Sky";
import { Orbit } from "@/components/home/Orbit";
import { SKY_SCRIPT } from "@/lib/sky";
import { Reveal } from "./Reveal";

/**
 * Лендинг Dots — то, что видит гость на главной. Вошедший человек
 * видит вместо него развилку с орбитой (см. app/page.tsx).
 *
 * Тексты простые и конкретные: что приложение делает и как, без
 * рекламных оборотов.
 */
const SIGN_UP = "/login?mode=up";

export function Landing() {
  // Шары ведут на регистрацию: заходить в приложения гостю пока некуда.
  const apps = APPS.map((a) => ({ ...a, href: SIGN_UP }));
  return (
    <HomeSky pill={false} script={<script dangerouslySetInnerHTML={{ __html: SKY_SCRIPT }} />}>
      {/* ─────────── первый экран ─────────── */}
      <section className="mx-auto w-full max-w-5xl px-5 pb-2" style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)" }}>
        <header className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[1.25rem] font-bold tracking-tight">
            <Logo size={26} />
            Dots
          </span>
          <Link href="/login" className="glass rounded-full px-4 py-2 text-[0.875rem] font-semibold transition active:scale-95">
            Войти
          </Link>
        </header>

        <div className="mt-6 md:mt-12 md:grid md:grid-cols-2 md:items-center md:gap-10">
          <div className="text-center md:text-left">
            <span className="glass inline-block rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold" style={{ color: "var(--ink-2)" }}>
              Деньги · Задачи · Цикл
            </span>
            <h1 className="animate-lift mt-4 text-[2.125rem] font-bold leading-[1.08] tracking-tight md:text-[3.25rem]">
              Деньги, дела и цикл в одном приложении
            </h1>
            <p className="animate-lift mx-auto mt-3 max-w-md text-[1rem] leading-relaxed md:mx-0" style={{ color: "var(--ink-2)", animationDelay: "120ms" }}>
              Записывайте траты, планируйте день и следите за циклом. Без таблиц и длинных форм: чтобы записать трату,
              достаточно перетащить кружок.
            </p>
            <div className="mt-6 hidden flex-col gap-2.5 md:flex md:max-w-sm">
              <Cta />
            </div>
          </div>
          <div className="mt-8 md:mt-0">
            <Orbit apps={apps} compact={false} delay={200} ratings={null} />
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2.5 md:hidden">
          <Cta />
        </div>
        <p className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[0.75rem] md:justify-start" style={{ color: "var(--ink-2)" }}>
          <span>✓ Бесплатно</span>
          <span>✓ Без рекламы</span>
          <span>✓ Данные видите только вы</span>
        </p>
      </section>

      {/* Дальше — обычные блоки в цветах темы; небо мягко уходит в фон. */}
      <div aria-hidden className="h-16" style={{ background: "linear-gradient(to bottom, transparent, var(--bg))" }} />
      <div style={{ background: "var(--bg)", color: "var(--text)" }}>
        <Feature
          color="#22c55e"
          icon="wallet"
          tag="Findots · Деньги"
          title="Сколько можно потратить сегодня"
          text="Приложение берёт деньги на картах и наличными, вычитает обязательные платежи и делит остаток на оставшиеся дни месяца. Потратили больше, завтра сумма будет меньше."
          points={[
            "Чтобы записать трату, перетащите кошелёк на категорию",
            "Долги, кредиты и накопления в одном месте",
            "Курс валют обновляется сам по данным Нацбанка",
            "Отчёт за месяц: на что ушло больше обычного",
          ]}
          demo={<MoneyDemo />}
        />
        <Feature
          tint
          color="#3b82f6"
          icon="list"
          tag="Todots · Задачи"
          title="Весь день на одном экране"
          text="Задачи стоят на ленте времени, красная линия показывает текущий момент. Что не успели сделать, само переедет на завтра."
          points={[
            "Перенести задачу на другой день можно перетаскиванием",
            "Напоминания приходят на телефон",
            "Повторяющиеся задачи и чек-листы",
            "Можно отмечать воду и сон",
          ]}
          demo={<TasksDemo />}
          flip
        />
        <Feature
          color="#ec4899"
          icon="flower"
          tag="FemDots · Цикл"
          title="Календарь цикла"
          text="Каждый лепесток цветка — один день цикла. Прогноз месячных и овуляции строится по вашим прошлым циклам, а тесты на овуляцию и температура делают его точнее."
          points={[
            "Каждый день короткая подсказка, что происходит в организме",
            "Отметки самочувствия, настроения и таблеток",
            "Напоминания о месячных и таблетках",
          ]}
          demo={<FlowerDemo />}
        />
        <Feature
          tint
          color="#f472b6"
          icon="heart"
          tag="Вместе"
          title="Можно подключить партнёра"
          text="Вы отправляете ему код. Он видит прогноз и советы, как поддержать вас в разные дни цикла. Вы можете попросить его о чём-то одной кнопкой и увидеть, что он ответил."
          points={["Что показывать партнёру, решаете вы", "Подключение можно отключить в любой момент"]}
          demo={<ChatDemo />}
          flip
        />

        {/* ─────────── приватность ─────────── */}
        <section style={{ background: "linear-gradient(180deg,#0b1026,#111a3a)", color: "#e2e8f0" }}>
          <Reveal className="mx-auto w-full max-w-5xl px-5 py-14">
            <Tag color="#6366f1" icon="shield" label="Приватность" />
            <h2 className="mt-3 text-[1.75rem] font-bold leading-tight tracking-tight text-white md:text-[2.25rem]">Ваши данные никто не видит</h2>
            <p className="mt-2 max-w-xl text-[0.9375rem] leading-relaxed" style={{ color: "#94a3b8" }}>
              Доступ к записям проверяется на стороне базы данных, а не только в приложении.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {[
                ["🔒", "Защищено в базе", "Чужие записи нельзя получить даже прямым запросом"],
                ["🌸", "Цикл", "Видите только вы и партнёр, если вы его подключили"],
                ["👁", "Скрыть суммы", "Одна кнопка прячет все суммы на экране"],
                ["🗑", "Удаление", "Аккаунт и все данные удаляются в настройках"],
              ].map(([emoji, title, text]) => (
                <div key={title} className="rounded-[1.25rem] p-4" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)" }}>
                  <span className="text-lg">{emoji}</span>
                  <p className="mt-2 text-[0.9375rem] font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-[0.8125rem] leading-snug" style={{ color: "#94a3b8" }}>
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ─────────── установка и вопросы ─────────── */}
        <section>
          <Reveal className="mx-auto w-full max-w-5xl px-5 py-14 md:grid md:grid-cols-2 md:gap-10">
            <div>
              <h2 className="text-[1.75rem] font-bold leading-tight tracking-tight">Установка на телефон</h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed" style={{ color: "var(--muted)" }}>
                Dots работает в браузере. Его можно добавить на главный экран, тогда он открывается как обычное приложение и
                присылает уведомления.
              </p>
              <ol className="mt-5 space-y-2.5">
                {[
                  ["Откройте dotsapp.vercel.app", "в Safari на iPhone или в Chrome на Android"],
                  ["Нажмите «Поделиться»", "на Android: меню ⋮ в углу"],
                  ["Выберите «На экран „Домой“»", "значок Dots появится рядом с другими приложениями"],
                ].map(([title, hint], i) => (
                  <li key={title} className="flex items-center gap-3 rounded-[1.25rem] px-4 py-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.9375rem] font-bold text-white"
                      style={{ background: "linear-gradient(135deg,#3b82f6,#ec4899)" }}
                    >
                      {i + 1}
                    </span>
                    <span>
                      <span className="block text-[0.9375rem] font-semibold">{title}</span>
                      <span className="block text-[0.8125rem]" style={{ color: "var(--muted)" }}>
                        {hint}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="mt-10 md:mt-0">
              <h2 className="text-[1.375rem] font-bold tracking-tight">Частые вопросы</h2>
              <div className="mt-4 space-y-2">
                {FAQ.map(([q, a]) => (
                  <details
                    key={q}
                    className="group rounded-[1.25rem] px-4 py-3.5 [&_summary::-webkit-details-marker]:hidden"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[0.9375rem] font-semibold">
                      {q}
                      <span className="shrink-0 transition group-open:rotate-90" style={{ color: "var(--muted)" }}>
                        <Icon name="chevron-right" size={16} />
                      </span>
                    </summary>
                    <p className="mt-2 text-[0.875rem] leading-relaxed" style={{ color: "var(--muted)" }}>
                      {a}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ─────────── финал ─────────── */}
        <section
          className="relative overflow-hidden text-center text-white"
          style={{ background: "linear-gradient(180deg,#3b0f7a 0%,#7a2bc4 35%,#c93a8f 72%,#e0653d 100%)" }}
        >
          <Reveal className="relative mx-auto w-full max-w-xl px-5 pb-10 pt-14">
            <div className="flex justify-center">
              <Logo size={44} />
            </div>
            <h2 className="mt-4 text-[1.875rem] font-bold tracking-tight">Начните сегодня</h2>
            <p className="mt-1 text-[0.9375rem]" style={{ color: "rgba(255,255,255,.82)" }}>
              Регистрация занимает минуту.
            </p>
            <Link
              href={SIGN_UP}
              className="mt-6 flex h-14 items-center justify-center rounded-[1.125rem] bg-white text-[1rem] font-bold transition active:scale-[0.98]"
              style={{ color: "#7a2bc4" }}
            >
              Создать аккаунт
            </Link>
            <p className="mt-8 flex justify-center gap-4 text-[0.75rem]" style={{ color: "rgba(255,255,255,.75)" }}>
              <Link href="/privacy" className="underline decoration-dotted underline-offset-2">
                Политика конфиденциальности
              </Link>
              <Link href="/terms" className="underline decoration-dotted underline-offset-2">
                Соглашение
              </Link>
            </p>
          </Reveal>
        </section>
      </div>
    </HomeSky>
  );
}

const FAQ: [string, string][] = [
  ["Это бесплатно?", "Да. Платить ни за что не нужно, рекламы нет."],
  ["Обязательно пользоваться всеми тремя приложениями?", "Нет. Лишние можно скрыть на главной, данные в них сохранятся."],
  ["Как подключить партнёра?", "В FemDots откройте вкладку «Вместе», нажмите «Пригласить» и отправьте ему код или ссылку."],
  ["На каких устройствах работает?", "На iPhone, Android и компьютере, в любом современном браузере."],
];

function Cta() {
  return (
    <>
      <Link
        href={SIGN_UP}
        className="flex h-14 items-center justify-center rounded-[1.125rem] text-[1rem] font-bold text-white transition active:scale-[0.98]"
        style={{ background: "linear-gradient(135deg,#22c55e,#3b82f6 55%,#ec4899)", boxShadow: "0 14px 30px -14px rgba(59,130,246,.8)" }}
      >
        Создать аккаунт
      </Link>
      <Link href="/login" className="glass flex h-14 items-center justify-center rounded-[1.125rem] text-[1rem] font-semibold transition active:scale-[0.98]">
        У меня уже есть аккаунт
      </Link>
    </>
  );
}

function Tag({ color, icon, label }: { color: string; icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-3 text-[0.8125rem] font-semibold text-white" style={{ background: color }}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,.25)" }}>
        <Icon name={icon} size={14} />
      </span>
      {label}
    </span>
  );
}

function Feature({
  color,
  icon,
  tag,
  title,
  text,
  points,
  demo,
  tint,
  flip,
}: {
  color: string;
  icon: string;
  tag: string;
  title: string;
  text: string;
  points: string[];
  demo: ReactNode;
  tint?: boolean;
  flip?: boolean;
}) {
  return (
    <section style={tint ? { background: `color-mix(in srgb, ${color} 6%, var(--bg))` } : undefined}>
      <Reveal className="mx-auto w-full max-w-5xl px-5 py-14 md:grid md:grid-cols-2 md:items-center md:gap-12">
        <div className={flip ? "md:order-2" : ""}>
          <Tag color={color} icon={icon} label={tag} />
          <h2 className="mt-3 text-[1.75rem] font-bold leading-tight tracking-tight md:text-[2.25rem]">{title}</h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed" style={{ color: "var(--muted)" }}>
            {text}
          </p>
          <ul className="mt-4 space-y-2.5">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[0.9375rem] leading-snug">
                <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: color }}>
                  <Icon name="check" size={14} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className={`mt-7 md:mt-0 ${flip ? "md:order-1" : ""}`}>{demo}</div>
      </Reveal>
    </section>
  );
}

const card = { background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 18px 40px -26px rgba(15,34,54,.35)" };

function MoneyDemo() {
  const bubble = (bg: string, icon: string, label: string) => (
    <span className="flex flex-col items-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full text-white" style={{ background: bg }}>
        <Icon name={icon} size={24} />
      </span>
      <span className="mt-1 text-[0.6875rem] font-medium" style={{ color: "var(--muted)" }}>
        {label}
      </span>
    </span>
  );
  const arrow = <span className="mx-1 mb-5 h-0.5 flex-1" style={{ background: "repeating-linear-gradient(90deg,#94a3b8 0 6px,transparent 6px 11px)" }} />;
  return (
    <div className="rounded-[1.5rem] p-4" style={card}>
      <p className="text-[0.8125rem]" style={{ color: "var(--muted)" }}>
        Можно тратить сегодня
      </p>
      <p className="text-[2.125rem] font-bold tabular-nums tracking-tight">11 527 ₸</p>
      <svg viewBox="0 0 320 46" className="mt-1 h-12 w-full" aria-hidden>
        <defs>
          <linearGradient id="land-g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#22c55e" stopOpacity=".35" />
            <stop offset="1" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 40 C40 38 60 30 90 28 S150 22 180 18 230 14 260 10 300 6 320 4 L320 46 L0 46Z" fill="url(#land-g)" />
        <path d="M0 40 C40 38 60 30 90 28 S150 22 180 18 230 14 260 10 300 6 320 4" fill="none" stroke="#22c55e" strokeWidth="2.5" />
      </svg>
      <div className="mt-3 flex items-center rounded-2xl px-3 pb-2 pt-3" style={{ background: "var(--surface-2)" }}>
        {bubble("#10b981", "briefcase", "Зарплата")}
        {arrow}
        {bubble("#e5383b", "card", "Kaspi")}
        {arrow}
        {bubble("#f59e0b", "groceries", "Продукты")}
      </div>
      <p className="mt-2 text-center text-[0.75rem]" style={{ color: "var(--muted)" }}>
        Перетащите кружок на кружок, чтобы записать операцию
      </p>
    </div>
  );
}

function TasksDemo() {
  const row = (time: string, title: string, done = false) => (
    <div className="flex items-center gap-3 py-2.5 text-[0.9375rem]" style={{ borderTop: "1px solid var(--border)" }}>
      <span className="w-11 text-[0.75rem] tabular-nums" style={{ color: "var(--muted)" }}>
        {time}
      </span>
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-white"
        style={done ? { background: "#3b82f6" } : { border: "2px solid var(--border)" }}
      >
        {done ? <Icon name="check" size={12} /> : null}
      </span>
      <span className={done ? "line-through" : ""} style={done ? { color: "var(--muted)" } : undefined}>
        {title}
      </span>
    </div>
  );
  return (
    <div className="rounded-[1.5rem] p-4" style={card}>
      <div className="flex items-center gap-4">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full" style={{ background: "conic-gradient(#3b82f6 0 60%, var(--surface-2) 60% 100%)" }}>
          <span className="flex h-[3.75rem] w-[3.75rem] items-center justify-center rounded-full text-[1.125rem] font-bold tabular-nums" style={{ background: "var(--surface)" }}>
            3/5
          </span>
        </span>
        <span>
          <span className="block text-[1.0625rem] font-bold">Сегодня</span>
          <span className="block text-[0.8125rem]" style={{ color: "var(--muted)" }}>
            Осталось 2 задачи, следующая в 14:00
          </span>
        </span>
      </div>
      <div className="mt-3">
        {row("08:00", "Зарядка", true)}
        {row("14:00", "Созвон с командой")}
        <div className="flex items-center gap-3 py-2.5" style={{ borderTop: "1px solid var(--border)" }}>
          <span className="w-11 text-[0.75rem] font-bold" style={{ color: "#ef4444" }}>
            сейчас
          </span>
          <span className="h-0.5 flex-1 rounded" style={{ background: "#ef4444" }} />
        </div>
        {row("19:00", "Купить продукты")}
      </div>
    </div>
  );
}

/** Цветок цикла: 28 лепестков, сегодня — 12-й. */
function FlowerDemo() {
  const colors = Array.from({ length: 28 }, (_, i) =>
    i < 5 ? "#fb7185" : i < 9 ? "#f9c4dc" : i < 14 ? (i === 12 ? "#14b8a6" : "#5eead4") : "#d8b4fe",
  );
  return (
    <div className="flex justify-center rounded-[1.5rem] py-6" style={card}>
      <svg viewBox="-110 -110 220 220" className="h-60 w-60" aria-label="Цветок цикла: 16 дней до месячных">
        {colors.map((c, i) => (
          <ellipse
            key={i}
            cx="0"
            cy="-62"
            rx="13"
            ry={i === 11 ? 44 : 38}
            fill={c}
            opacity={i === 11 ? 1 : 0.85}
            transform={`rotate(${(i * 360) / colors.length})`}
          />
        ))}
        <circle r="44" fill="var(--surface)" stroke="#14b8a6" strokeWidth="4" />
        <text y="0" textAnchor="middle" fontSize="30" fontWeight="700" fill="currentColor">
          16
        </text>
        <text y="20" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="currentColor">
          дней до
        </text>
        <text y="31" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="currentColor">
          месячных
        </text>
      </svg>
    </div>
  );
}

function ChatDemo() {
  const msg = (bg: string, children: ReactNode, right = false) => (
    <div className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-[0.875rem] leading-snug ${right ? "self-end" : ""}`} style={{ background: bg }}>
      {children}
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5 rounded-[1.5rem] p-4" style={card}>
      {msg("color-mix(in srgb, #ec4899 12%, var(--surface))", <>💗 <b>Алиса:</b> Нужна забота</>)}
      {msg(
        "color-mix(in srgb, #14b8a6 12%, var(--surface))",
        <>
          🏃 <b>Саша:</b> Буду через 20 минут
          <span className="mt-1.5 flex items-center gap-1 text-[0.6875rem]" style={{ color: "var(--muted)" }}>
            <i className="h-1.5 w-1.5 rounded-full bg-[#14b8a6]" /> Отправлено
            <i className="h-0.5 w-3 bg-[#14b8a6]" />
            <i className="h-1.5 w-1.5 rounded-full bg-[#14b8a6]" /> Увидел
            <i className="h-0.5 w-3 bg-[#14b8a6]" />
            <i className="h-1.5 w-1.5 rounded-full bg-[#14b8a6]" /> Бежит
          </span>
        </>,
        true,
      )}
      {msg(
        "color-mix(in srgb, #ec4899 12%, var(--surface))",
        <>
          🛍 <b>Алиса:</b> Купи по дороге шоколадку
          <span className="mt-1 block text-[0.75rem]" style={{ color: "var(--muted)" }}>
            💝 Она любит: молочный Milka с орехами
          </span>
        </>,
      )}
      {msg(
        "color-mix(in srgb, #3b82f6 12%, var(--surface))",
        <>
          💌 <b>Саша зовёт:</b> 🎬 кино, завтра в 19:00
          <span className="mt-2 flex flex-wrap gap-1.5">
            {["Да! 💗", "Давай в другой день", "✏️ Своё"].map((t) => (
              <span key={t} className="rounded-full px-2.5 py-1 text-[0.75rem]" style={{ background: "var(--surface)" }}>
                {t}
              </span>
            ))}
          </span>
        </>,
        true,
      )}
    </div>
  );
}
