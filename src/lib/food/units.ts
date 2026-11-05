/** Граммы или миллилитры. Калории в обоих случаях — на 100 г или на 100 мл. */
export type Unit = "g" | "ml";

// Жидкое по названию: напитки, молочное питьевое, бульоны. Слово должно
// начинаться с корня, иначе «сок» нашёлся бы в «высокий».
const LIQUID =
  /(^|[^а-яё])(вод[аыуе]|минералк|сок|нектар|морс|компот|молоко|кефир|айран|ряженк|кумыс|шубат|чай|кофе|капучино|латте|американо|эспрессо|какао|лимонад|кола|пепси|спрайт|фанта|газировк|напиток|напитк|энергетик|пиво|вино|шампанск|квас|смузи|коктейл|бульон|питьев)/;

export function guessUnit(name: string): Unit {
  return LIQUID.test(name.toLowerCase().replace(/ё/g, "е")) ? "ml" : "g";
}

/** Единица записи или продукта: сохранённая, а если её нет — по названию. */
export const unitOf = (x: { unit?: Unit | null; name: string }): Unit => x.unit ?? guessUnit(x.name);

/** «г» или «мл». */
export const ul = (u: Unit) => (u === "ml" ? "мл" : "г");

/**
 * Порция по умолчанию: вся упаковка, если она небольшая (до 300 г или до
 * 500 мл), иначе 100 г или стакан 250 мл.
 */
export function defaultPortion(p: { pack_grams: number | null; unit?: Unit | null; name: string }): number {
  const ml = unitOf(p) === "ml";
  if (p.pack_grams && p.pack_grams <= (ml ? 500 : 300)) return p.pack_grams;
  return ml ? 250 : 100;
}
