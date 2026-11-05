/** Разбор JSON из ответов нейросетей: терпимо к небрежностям и обрывам. */

/**
 * Ответ оборвался на середине (кончились токены): отрезаем недописанное
 * после последней закрытой «}» и закрываем открытые скобки. Так блюда,
 * которые модель успела перечислить, не пропадают.
 */
function closeCut(raw: string): Record<string, unknown> | null {
  let tries = 0;
  for (let i = raw.length - 1; i > 0 && tries < 12; i--) {
    if (raw[i] !== "}") continue;
    tries++;
    const part = raw.slice(0, i + 1);
    const stack: string[] = [];
    let inStr = false;
    for (let k = 0; k < part.length; k++) {
      const ch = part[k];
      if (inStr) {
        if (ch === "\\") k++;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{" || ch === "[") stack.push(ch);
      else if (ch === "}" || ch === "]") stack.pop();
    }
    if (inStr) continue;
    const closed = part + stack.reverse().map((c) => (c === "{" ? "}" : "]")).join("");
    try {
      const d = JSON.parse(closed.replace(/,\s*([}\]])/g, "$1"));
      if (d && typeof d === "object") return d as Record<string, unknown>;
    } catch {
      // режем ещё на одну «}» раньше
    }
  }
  return null;
}

export function jsonFrom(text: string): Record<string, unknown> | null {
  const closed = text.lastIndexOf("</think>");
  if (closed >= 0) text = text.slice(closed + 8);
  text = text.replace(/```(?:json)?/gi, "");
  const start = text.indexOf("{");
  let end = text.lastIndexOf("}");
  // Ответ — просто список блюд без обёртки: «[` идёт раньше первой «{».
  const a = text.indexOf("[");
  const b = text.lastIndexOf("]");
  if (a >= 0 && b > a && (start < 0 || a < start)) return jsonFrom(`{"items":${text.slice(a, b + 1)}}`);
  if (start < 0) return null;
  if (end <= start) end = text.length - 1;
  const raw = text.slice(start, end + 1);
  for (const variant of [raw, raw.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"')]) {
    try {
      const d = JSON.parse(variant);
      if (d && typeof d === "object") return d as Record<string, unknown>;
    } catch {
      // пробуем исправленный вариант
    }
  }
  return closeCut(text.slice(start));
}
