// Иконки PWA рисуются кодом, а не лежат в репозитории картинками:
// одна правка палитры — и все размеры пересобираются. Запускается из
// prebuild, так что на Vercel файлы появляются сами.
//
// Знак тот же, что у Findots, а подложка светлая: на домашнем экране два
// одинаковых значка не различить, а так это очевидная пара.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BACKGROUND = [0xf2, 0xf2, 0xf7];

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Те же три кружка и те же цвета, что на экране входа.
const DOTS = [
  { x: 0.5, y: 0.29, r: 0.145, c: [34, 197, 94] },
  { x: 0.31, y: 0.63, r: 0.145, c: [96, 165, 250] },
  { x: 0.69, y: 0.63, r: 0.145, c: [249, 115, 22] },
];

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const inside = (x, y) => {
    const cx = Math.min(Math.max(x, radius), size - radius);
    const cy = Math.min(Math.max(y, radius), size - radius);
    return Math.hypot(x - cx, y - cy) <= radius;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inside(x + 0.5, y + 0.5)) continue;
      px[i] = BACKGROUND[0];
      px[i + 1] = BACKGROUND[1];
      px[i + 2] = BACKGROUND[2];
      px[i + 3] = 255;

      for (const dot of DOTS) {
        const d = Math.hypot(x + 0.5 - dot.x * size, y + 0.5 - dot.y * size);
        const edge = dot.r * size;
        const alpha = Math.max(0, Math.min(1, edge - d));
        if (alpha <= 0) continue;
        for (let c = 0; c < 3; c++) {
          px[i + c] = Math.round(px[i + c] * (1 - alpha) + dot.c[c] * alpha);
        }
      }
    }
  }
  return png(size, px);
}

mkdirSync("public/icons", { recursive: true });
for (const size of [180, 192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, render(size));
}
console.log("Иконки собраны: public/icons/icon-{180,192,512}.png");
