/**
 * Тренировки Yumdots: виды и расчёт сожжённого.
 *
 * Калории считаем по MET (во сколько раз нагрузка больше покоя):
 * ккал = MET × вес, кг × часы. Это «активные + базовые» за время
 * тренировки; базовые уже есть в норме, поэтому вычитаем 1 MET —
 * так цифра ближе к «активным калориям» на часах.
 */

export interface WorkoutKind {
  id: string;
  label: string;
  emoji: string;
  met: number;
}

export const KINDS: WorkoutKind[] = [
  { id: "walk", label: "Ходьба", emoji: "🚶", met: 3.5 },
  { id: "run", label: "Бег", emoji: "🏃", met: 9.8 },
  { id: "bike", label: "Велосипед", emoji: "🚴", met: 7.5 },
  { id: "gym", label: "Силовая", emoji: "🏋️", met: 5 },
  { id: "fitness", label: "Фитнес", emoji: "🤸", met: 6.5 },
  { id: "hiit", label: "Интервальная", emoji: "🔥", met: 8 },
  { id: "swim", label: "Плавание", emoji: "🏊", met: 7 },
  { id: "yoga", label: "Йога, растяжка", emoji: "🧘", met: 2.8 },
  { id: "dance", label: "Танцы", emoji: "💃", met: 5.5 },
  { id: "ball", label: "Футбол, игры", emoji: "⚽", met: 7 },
  { id: "box", label: "Единоборства", emoji: "🥊", met: 9 },
  { id: "ski", label: "Лыжи, коньки", emoji: "⛷️", met: 7 },
  { id: "other", label: "Другое", emoji: "💪", met: 5 },
];

export const STEPS_KIND: WorkoutKind = { id: "steps", label: "Шаги", emoji: "👣", met: 0 };

export function kindOf(id: string): WorkoutKind {
  return id === "steps" ? STEPS_KIND : (KINDS.find((k) => k.id === id) ?? { id, label: id, emoji: "💪", met: 5 });
}

/** Вес для расчёта: из настроек, а если не указан — 70 кг. */
export const weightOr = (kg: number | null | undefined) => (kg && kg > 0 ? kg : 70);

/** Активные калории за тренировку. */
export function workoutKcal(kind: WorkoutKind, minutes: number, weightKg: number): number {
  return Math.max(0, Math.round((kind.met - 1) * weightKg * (minutes / 60)));
}

/** Обычные шаги за день (дом, работа) уже учтены в норме через уровень активности. */
export const STEPS_BASE = 4000;

/**
 * Шаги → калории: только шаги сверх обычных STEPS_BASE, примерно
 * 0,0005 ккал на шаг на каждый кг (80 кг → 0,04 ккал за шаг).
 */
export function stepsKcal(steps: number, weightKg: number): number {
  return Math.max(0, Math.round(Math.max(0, steps - STEPS_BASE) * weightKg * 0.0005));
}
