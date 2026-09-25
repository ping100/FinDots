// Воркер pdf.js нужен как отдельный файл в /public: он весит больше мегабайта
// и подтягивается только тогда, когда человек грузит выписку из банка.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Сборка legacy — с заплатками для старых браузеров: обычная с версии 6
// требует возможностей iOS 18.2 и на телефонах постарше не читала бы выписку.
const from = join(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs");
const to = join(root, "public/pdf.worker.min.mjs");

mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log("pdf.worker.min.mjs → public/");
