/**
 * Текст из PDF прямо в браузере.
 *
 * Выписка — это личные финансы, и отправлять её на сервер незачем: pdf.js
 * читает файл на устройстве, наружу не уходит ничего. Библиотека тяжёлая,
 * поэтому подгружается только в тот момент, когда человек выбрал файл.
 */
export async function pdfLines(file: File): Promise<string[]> {
  // legacy — с заплатками для iPhone без iOS 18.2 (см. scripts/copy-pdf-worker.mjs).
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;

  const lines: string[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const content = await (await doc.getPage(n)).getTextContent();

    // pdf.js отдаёт разрозненные куски текста с координатами. Собираем их в
    // строки по вертикали: выписка свёрстана таблицей, и только целая строка
    // несёт смысл — дата, сумма и описание лежат в разных кусках.
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      rows.set(key, [...(rows.get(key) ?? []), { x: item.transform[4], s: item.str }]);
    }

    for (const [, parts] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
      lines.push(
        parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ").replace(/\s+/g, " ").trim(),
      );
    }
  }

  await task.destroy();
  return lines;
}
