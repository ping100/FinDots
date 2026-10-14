/**
 * Время суток для фона главной: утро 5–11, день 11–17, вечер 17–21,
 * ночь 21–5. По часам телефона — небо должно совпадать с окном.
 */
export type SkyPeriod = "morning" | "day" | "evening" | "night";

export function skyPeriod(date = new Date()): SkyPeriod {
  const h = date.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "day";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

export const SKY_WORD: Record<SkyPeriod, string> = {
  morning: "утро",
  day: "день",
  evening: "вечер",
  night: "ночь",
};

/**
 * Ставит небо до первой отрисовки: на сервере не знают, который час у
 * человека, и без этого главная вспыхивала бы чужим цветом. Скрипт стоит
 * первым ребёнком обёртки неба и красит своего родителя.
 */
export const SKY_SCRIPT = `(function(){try{var h=new Date().getHours();var p=h>=5&&h<11?"morning":h>=11&&h<17?"day":h>=17&&h<21?"evening":"night";document.currentScript.parentElement.setAttribute("data-sky",p)}catch(e){}})()`;
