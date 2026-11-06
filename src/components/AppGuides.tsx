"use client";

import { Icon } from "@/lib/icons";
import { Arrow, GuideSheet, INSTALL_STEP, Scene, type Step } from "./Guide";

/**
 * Инструкции «Как пользоваться» для «Списка дел», «Женского календаря» и
 * «Учёта калорий». Как и в «Учёте средств»: на каждом шаге картинка из
 * того, что человек увидит на экране, и пара фраз.
 */

/** Кружок с эмодзи — как элементы на экране приложения. */
function Bubble({ emoji, color, label, small }: { emoji: string; color: string; label?: string; small?: boolean }) {
  const size = small ? 40 : 52;
  return (
    <span className="flex flex-col items-center gap-1">
      <span
        className="flex items-center justify-center rounded-full"
        style={{ width: size, height: size, fontSize: size * 0.48, background: `color-mix(in srgb, ${color} 18%, var(--surface))`, boxShadow: `0 4px 14px ${color}33` }}
      >
        {emoji}
      </span>
      {label ? (
        <span className="text-[0.625rem]" style={{ color: "var(--muted)" }}>
          {label}
        </span>
      ) : null}
    </span>
  );
}

/** Строка задачи, как в списке. */
function TaskLine({ title, done, color = "#60a5fa", time }: { title: string; done?: boolean; color?: string; time?: string }) {
  return (
    <span className="flex w-full max-w-[240px] items-center gap-2.5 rounded-2xl px-3 py-2.5" style={{ background: "var(--surface)" }}>
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-white"
        style={{ borderColor: color, background: done ? color : "transparent" }}
      >
        {done ? <Icon name="check" size={12} /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.8125rem]" style={{ textDecoration: done ? "line-through" : undefined, opacity: done ? 0.55 : 1 }}>
        {title}
      </span>
      {time ? (
        <span className="text-[0.6875rem] tabular-nums" style={{ color: "var(--muted)" }}>
          {time}
        </span>
      ) : null}
    </span>
  );
}

function Days({ on = 2 }: { on?: number }) {
  const days = ["Пн", "Вт", "Ср", "Чт", "Пт"];
  return (
    <span className="flex gap-1.5">
      {days.map((d, i) => (
        <span
          key={d}
          className="flex w-10 flex-col items-center rounded-xl py-1.5 text-[0.625rem]"
          style={i === on ? { background: "var(--accent)", color: "#fff" } : { background: "var(--surface)", color: "var(--muted)" }}
        >
          {d}
          <b className="text-[0.875rem]">{3 + i}</b>
        </span>
      ))}
    </span>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="rounded-full px-3 py-1.5 text-[0.75rem] font-medium" style={{ background: color ? `color-mix(in srgb, ${color} 16%, var(--surface))` : "var(--surface)", color: color ?? undefined }}>
      {children}
    </span>
  );
}

const TASKS: Step[] = [
  {
    title: "День за днём",
    text: "Сверху — лента дней: листайте и нажимайте на нужный. Кольцо из точек показывает задачи дня: сделанные светятся. Задачи со временем стоят на ленте по часам, без времени — сверху, «в течение дня».",
    art: (
      <Scene>
        <Days />
      </Scene>
    ),
  },
  {
    title: "Добавить задачу",
    text: "Кнопка «+» внизу. Достаточно названия, а если нужно — время, категория, повтор (каждый день, по будням, в нужные дни) и напоминание.",
    art: (
      <Scene>
        <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-white" style={{ background: "var(--accent)" }}>
          <Icon name="plus" size={24} />
        </span>
        <Arrow />
        <TaskLine title="Позвонить маме" time="19:00" />
      </Scene>
    ),
  },
  {
    title: "Сделано — галочка",
    text: "Нажмите на кружок слева или смахните задачу вправо. Ошиблись — нажмите ещё раз, задача вернётся.",
    art: (
      <Scene>
        <div className="flex w-full flex-col items-center gap-2">
          <TaskLine title="Купить продукты" done color="#22c55e" />
          <TaskLine title="Оплатить интернет" color="#f59e0b" />
        </div>
      </Scene>
    ),
  },
  {
    title: "Не успели — перенесите",
    text: "Смахните задачу влево — она уедет на следующий день (просроченная — на сегодня). Или задержите палец и перетащите её на любой день в ленте сверху.",
    art: (
      <Scene>
        <div className="flex flex-col items-center gap-2">
          <Days on={3} />
          <span className="-rotate-90" style={{ color: "var(--muted)" }}>
            <Arrow />
          </span>
          <TaskLine title="Записаться к врачу" />
        </div>
      </Scene>
    ),
  },
  {
    title: "Категории",
    text: "Плитки категорий показывают, сколько задач в каждой. Нажмите — останутся только её задачи. Перетащите задачу на плитку — сменится категория. Свои категории заводятся в настройках.",
    art: (
      <Scene>
        <Bubble emoji="🏠" color="#22c55e" label="Дом" />
        <Bubble emoji="💼" color="#60a5fa" label="Работа" />
        <Bubble emoji="🏃" color="#f97316" label="Спорт" />
      </Scene>
    ),
  },
  {
    title: "Напоминания",
    text: "У задачи со временем можно включить колокольчик — пуш придёт, даже когда приложение закрыто. В настройках есть утренняя сводка: что сегодня по плану. Пуши включаются в настройках, в разделе «Напоминания».",
    art: (
      <Scene>
        <Bubble emoji="🔔" color="#f59e0b" />
        <span className="rounded-2xl px-3 py-2 text-left text-[0.75rem] leading-snug" style={{ background: "var(--surface)" }}>
          <b>Позвонить маме</b>
          <br />
          19:00
        </span>
      </Scene>
    ),
  },
  INSTALL_STEP,
];

const FEM: Step[] = [
  {
    title: "Главное — на первом экране",
    text: "Какой сейчас день цикла, какая фаза и сколько осталось до месячных. Цветок в центре меняется вместе с фазой. Нажмите на подпись под кругом, чтобы выбрать его вид: цветок может жить по времени суток и погоде.",
    art: (
      <Scene>
        <Bubble emoji="🌸" color="#ec4899" />
        <span className="text-left">
          <b className="block text-[1.25rem]">12-й день</b>
          <span className="text-[0.75rem]" style={{ color: "var(--muted)" }}>
            до месячных 16 дней
          </span>
        </span>
      </Scene>
    ),
  },
  {
    title: "Как вы сегодня?",
    text: "Плитки на главной: настроение, самочувствие, близость, а в дни месячных — сами месячные. Нажмите на плитку и отметьте, что есть. Чем чаще отмечаете, тем точнее прогноз и подсказки.",
    art: (
      <Scene>
        <Bubble emoji="😊" color="#f59e0b" label="настроение" small />
        <Bubble emoji="🤕" color="#60a5fa" label="самочувствие" small />
        <Bubble emoji="💞" color="#ec4899" label="близость" small />
        <Bubble emoji="🩸" color="#ef4444" label="месячные" small />
      </Scene>
    ),
  },
  {
    title: "Календарь",
    text: "Прошлые месячные, прогноз следующих и дни овуляции. Нажмите на день, чтобы посмотреть или дописать отметки. Начало и конец месячных отмечаются там же.",
    art: (
      <Scene>
        <span className="grid grid-cols-7 gap-1">
          {Array.from({ length: 14 }, (_, i) => (
            <span
              key={i}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[0.6875rem]"
              style={
                i < 4
                  ? { background: "#ec4899", color: "#fff" }
                  : i >= 10 && i < 13
                    ? { background: "color-mix(in srgb, #8b5cf6 22%, var(--surface))" }
                    : { background: "var(--surface)" }
              }
            >
              {i + 1}
            </span>
          ))}
        </span>
      </Scene>
    ),
  },
  {
    title: "Итоги и подсказки",
    text: "Во вкладке «Итоги» — какой у вас обычно цикл и сколько длятся месячные. А на главной появятся подсказки по прошлым циклам, например «завтра возможна головная боль».",
    art: (
      <Scene>
        <Pill color="#8b5cf6">Цикл обычно 28 дней</Pill>
        <Pill color="#ec4899">Месячные 5 дней</Pill>
      </Scene>
    ),
  },
  {
    title: "Вместе с партнёром",
    text: "В настройках, в разделе «Партнёр», можно пригласить близкого человека. Он увидит фазу цикла и советы, как поддержать, а что ещё ему показывать — решаете вы. Отключить можно в любой момент.",
    art: (
      <Scene>
        <Bubble emoji="🌸" color="#ec4899" label="вы" />
        <span style={{ color: "#ec4899" }}>
          <Icon name="heart" size={22} />
        </span>
        <Bubble emoji="🤝" color="#60a5fa" label="партнёр" />
      </Scene>
    ),
  },
  {
    title: "Напоминания",
    text: "Пуш за 2 дня до месячных, в первый день фертильного окна и о таблетке в нужное время — включаются в настройках. Всё, что вы записываете, видите только вы.",
    art: (
      <Scene>
        <Bubble emoji="🔔" color="#ec4899" />
        <span className="rounded-2xl px-3 py-2 text-left text-[0.75rem] leading-snug" style={{ background: "var(--surface)" }}>
          <b>Через 2 дня</b>
          <br />
          ожидаются месячные
        </span>
      </Scene>
    ),
  },
  INSTALL_STEP,
];

const FOOD: Step[] = [
  {
    title: "Ваша норма на день",
    text: "Кольцо показывает, сколько калорий осталось на сегодня, а полоски под ним — белки, жиры и углеводы. Норма считается по росту, весу, возрасту и цели — укажите их в настройках.",
    art: (
      <Scene>
        <span className="flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full border-[8px] text-center" style={{ borderColor: "#f97316" }}>
          <b className="text-[1.125rem] leading-none">1 240</b>
          <span className="text-[0.5625rem]" style={{ color: "var(--muted)" }}>
            осталось
          </span>
        </span>
      </Scene>
    ),
  },
  {
    title: "Сфотографируйте тарелку",
    text: "Кнопка «+», затем «Сфотографировать тарелку»: нейросеть найдёт блюда и оценит вес, калории и БЖУ. Или «Словами»: «гречка и котлета», можно с весом. Перед сохранением всё можно поправить.",
    art: (
      <Scene>
        <Bubble emoji="📷" color="#f97316" label="фото" />
        <Arrow />
        <span className="rounded-2xl px-3 py-2 text-left text-[0.75rem] leading-snug" style={{ background: "var(--surface)" }}>
          <b>Плов</b> · 300 г
          <br />
          <span style={{ color: "#f97316" }}>560 ккал</span>
        </span>
      </Scene>
    ),
  },
  {
    title: "Штрихкод с упаковки",
    text: "«Штрихкод» → наведите камеру. Калории и БЖУ подтянутся из общей базы Dots. Продукта ещё нет — сфотографируйте этикетку, и он появится у всех.",
    art: (
      <Scene>
        <Bubble emoji="🏷️" color="#f97316" label="штрихкод" />
        <Arrow />
        <Pill color="#16a34a">✓ Проверено Dots</Pill>
      </Scene>
    ),
  },
  {
    title: "Быстро — из своего",
    text: "Под кнопками «+» видно, что вы чаще едите в это время. В «Найти» есть всё, что вы уже ели, и общая база продуктов. Плюсик добавляет сразу: так можно собрать весь завтрак и нажать «Готово».",
    art: (
      <Scene>
        <div className="flex w-full max-w-[240px] flex-col gap-1.5">
          {[
            ["🥣", "Овсянка", "310"],
            ["☕", "Кофе с молоком", "60"],
          ].map(([e, n, k]) => (
            <span key={n} className="flex items-center gap-2 rounded-2xl px-2.5 py-2" style={{ background: "var(--surface)" }}>
              <span className="text-lg">{e}</span>
              <span className="flex-1 text-left text-[0.8125rem]">{n}</span>
              <span className="text-[0.75rem]" style={{ color: "#f97316" }}>
                {k}
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, #f97316 16%, transparent)", color: "#f97316" }}>
                <Icon name="plus" size={13} />
              </span>
            </span>
          ))}
        </div>
      </Scene>
    ),
  },
  {
    title: "Или просто напишите в чат",
    text: "Во вкладке «Чат» пишете как другу: «на ужин гречка 200 г и две котлеты», или шлёте фото. В ответ список с калориями: поправьте, если нужно, и нажмите «Записать». Кнопки над полем повторяют вчерашнее и частое.",
    art: (
      <Scene>
        <div className="flex w-full max-w-[250px] flex-col gap-1.5">
          <span className="self-end rounded-2xl rounded-br-md px-3 py-1.5 text-[0.75rem] text-white" style={{ background: "#f97316" }}>
            гречка и две котлеты
          </span>
          <span className="self-start rounded-2xl rounded-bl-md px-3 py-1.5 text-left text-[0.75rem]" style={{ background: "var(--surface)" }}>
            Итого <b>710 ккал</b> · <span style={{ color: "#f97316" }}>Записать</span>
          </span>
        </div>
      </Scene>
    ),
  },
  {
    title: "Вес, мл и сахар",
    text: "Поменяйте вес — калории пересчитаются сами. У напитков вес в мл, а у чая и кофе можно добавить кубики сахара. Записанное правится нажатием на блюдо на «Сегодня».",
    art: (
      <Scene>
        <Pill>250 мл</Pill>
        <Pill color="#f97316">🧊 Сахар · 2</Pill>
      </Scene>
    ),
  },
  {
    title: "Вода и активность",
    text: "Отмечайте стаканы воды на «Сегодня». Во вкладке «Активность» — тренировки и шаги: сожжённое прибавится к норме еды. Цифру с часов можно вписать вручную.",
    art: (
      <Scene>
        <Bubble emoji="💧" color="#0ea5e9" label="вода" />
        <Bubble emoji="🔥" color="#f97316" label="−320 ккал" />
      </Scene>
    ),
  },
  INSTALL_STEP,
];

export function TasksGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <GuideSheet open={open} onClose={onClose} steps={TASKS} />;
}
export function FemGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <GuideSheet open={open} onClose={onClose} steps={FEM} />;
}
export function FoodGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <GuideSheet open={open} onClose={onClose} steps={FOOD} />;
}

/** Строка «Как пользоваться» в настройках — в группе «Помощь», как соседние. */
export function HowToRow({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3.5 text-left [&:not(:first-child)]:border-t" style={{ borderColor: "var(--border)" }}>
      <span className="flex-1">
        <span className="block text-[0.9375rem]">Как пользоваться</span>
        <span className="mt-0.5 block text-[0.6875rem] leading-snug" style={{ color: "var(--muted)" }}>
          Короткая инструкция по шагам — та же, что при первом входе
        </span>
      </span>
      <Icon name="chevron-right" size={16} className="opacity-30" />
    </button>
  );
}
