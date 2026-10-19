// Иконки PWA рисуются кодом, а не лежат в репозитории картинками:
// одна правка палитры — и все размеры пересобираются. Запускается из
// prebuild, так что на Vercel файлы появляются сами.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

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
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
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

// Три кружка — Findots, Todots, FemDots — на тёмном скруглённом квадрате.
// Каждый объёмный, как знак в приложении: радиальный перелив светлый →
// основной → тёмный из точки сверху слева (как radialGradient cx .35 cy .3
// r .8 в SVG) и маленький блик.
const DOTS = [
  { x: 0.5, y: 0.29, r: 0.145, lo: [21, 128, 61], c: [34, 197, 94], hi: [134, 239, 172] },
  { x: 0.31, y: 0.63, r: 0.145, lo: [29, 78, 216], c: [96, 165, 250], hi: [191, 219, 254] },
  { x: 0.69, y: 0.63, r: 0.145, lo: [190, 24, 93], c: [236, 72, 153], hi: [251, 207, 232] },
];

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function shade(dot, t) {
  return t <= 0.55 ? mix(dot.hi, dot.c, t / 0.55) : mix(dot.c, dot.lo, Math.min(1, (t - 0.55) / 0.45));
}

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
      px[i] = 0x0b;
      px[i + 1] = 0x0f;
      px[i + 2] = 0x16;
      px[i + 3] = 255;

      for (const dot of DOTS) {
        const R = dot.r * size;
        const cx = dot.x * size;
        const cy = dot.y * size;
        const px0 = x + 0.5;
        const py0 = y + 0.5;
        const alpha = Math.max(0, Math.min(1, R - Math.hypot(px0 - cx, py0 - cy)));
        if (alpha <= 0) continue;
        // Перелив: от точки (cx − 0.3R, cy − 0.4R), радиус градиента 1.6R.
        const t = Math.hypot(px0 - (cx - 0.3 * R), py0 - (cy - 0.4 * R)) / (1.6 * R);
        let col = shade(dot, t);
        // Блик: кружок 0.25R в (cx − 0.31R, cy − 0.35R), белый 45%.
        const hl = Math.max(0, Math.min(1, 0.25 * R - Math.hypot(px0 - (cx - 0.31 * R), py0 - (cy - 0.35 * R)))) * 0.45;
        if (hl > 0) col = mix(col, [255, 255, 255], hl);
        for (let c = 0; c < 3; c++) {
          px[i + c] = Math.round(px[i + c] * (1 - alpha) + col[c] * alpha);
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
