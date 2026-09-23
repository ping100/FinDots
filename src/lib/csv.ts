/**
 * Разбор и сборка CSV.
 *
 * Своё, а не библиотека: нужен один проход по строке с учётом кавычек и
 * автоопределением разделителя — выгрузки из русских программ приходят
 * через точку с запятой, потому что Excel в этой локали так и сохраняет.
 */

/** Разделитель угадываем по первой строке: чей символ чаще, тот и разделитель. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t", "|"].map((d) => ({
    d,
    n: firstLine.split(d).length - 1,
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

export function parseCsv(input: string): string[][] {
  // BOM Excel ставит в начало файла, и без этого первая колонка называется
  // «﻿дата» и не совпадает ни с одним заголовком.
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        // Удвоенная кавычка внутри поля — это одна кавычка, а не конец поля.
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  // Пустые хвостовые строки — обычный мусор в конце выгрузки.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined) => {
    const text = value == null ? "" : String(value);
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  // Точка с запятой и BOM: так файл открывается двойным кликом в Excel с
  // русской локалью, не превращаясь в один столбец с кракозябрами.
  return "﻿" + rows.map((row) => row.map(cell).join(";")).join("\r\n");
}

/**
 * Дата из чужой выгрузки. Принимаем то, что реально встречается:
 * 2026-09-23, 23.09.2026, 23/09/2026 — с временем и без.
 */
export function parseDate(input: string): Date | null {
  const text = input.trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (iso) {
    const [, y, m, d, hh = "12", mm = "00"] = iso;
    return valid(new Date(+y, +m - 1, +d, +hh, +mm));
  }

  const dotted = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})(?:[ T](\d{2}):(\d{2}))?/);
  if (dotted) {
    const [, d, m, rawYear, hh = "12", mm = "00"] = dotted;
    const year = rawYear.length === 2 ? 2000 + +rawYear : +rawYear;
    return valid(new Date(year, +m - 1, +d, +hh, +mm));
  }

  return valid(new Date(text));
}

function valid(date: Date): Date | null {
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Сумма из чужой выгрузки: «1 234,56», «1,234.56», «-500», «1 200,00 ₸».
 * Знак сохраняем — по нему часто и отличают расход от дохода.
 */
export function parseNumber(input: string): number | null {
  let text = input.replace(/[^\d,.\-+]/g, "").trim();
  if (!text) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Тот разделитель, что правее, — дробный; второй разделяет разряды.
    const fraction = lastComma > lastDot ? "," : ".";
    const thousands = fraction === "," ? "." : ",";
    text = text.split(thousands).join("").replace(fraction, ".");
  } else if (lastComma >= 0) {
    // Одна запятая: дробная часть, если после неё не ровно три цифры.
    text = text.length - lastComma === 4 ? text.split(",").join("") : text.replace(",", ".");
  }

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
