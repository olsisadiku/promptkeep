// Dependency-free 1024×1024 PNG app-icon generator. Produces a rounded-square
// gradient "plate" with a white stacked-lines glyph (a prompt/list motif).
// Usage: node tools/generate-icon.mjs <out.png>
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZE = 1024;
const out = process.argv[2] || "icon-source.png";

const buf = Buffer.alloc(SIZE * SIZE * 4); // RGBA
const px = (x, y, r, g, b, a = 255) => {
  const i = (y * SIZE + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
};

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
// Gradient endpoints: deep indigo -> violet.
const C0 = [79, 70, 229]; // #4F46E5
const C1 = [139, 92, 246]; // #8B5CF6

const radius = 220; // rounded-corner radius
function insidePlate(x, y) {
  const r = radius;
  const minx = r, maxx = SIZE - r, miny = r, maxy = SIZE - r;
  let cx = x, cy = y;
  if (x < minx) cx = minx;
  else if (x > maxx) cx = maxx;
  if (y < miny) cy = miny;
  else if (y > maxy) cy = maxy;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// White rounded glyph bars (a stacked "prompt lines" mark).
const bars = [
  { x: 300, y: 360, w: 424, h: 70 },
  { x: 300, y: 490, w: 424, h: 70 },
  { x: 300, y: 620, w: 280, h: 70 },
];
function inBar(x, y) {
  for (const b of bars) {
    const r = b.h / 2;
    const minx = b.x + r, maxx = b.x + b.w - r;
    let cx = x;
    if (x < minx) cx = minx;
    else if (x > maxx) cx = maxx;
    const insideY = y >= b.y && y <= b.y + b.h;
    const dx = x - cx;
    const withinCap = Math.abs(dx) <= r && y >= b.y && y <= b.y + b.h;
    if ((x >= minx && x <= maxx && insideY) || (withinCap && insideY)) return true;
  }
  return false;
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!insidePlate(x, y)) {
      px(x, y, 0, 0, 0, 0); // transparent outside the rounded plate
      continue;
    }
    const t = (x + y) / (2 * SIZE);
    const r = lerp(C0[0], C1[0], t);
    const g = lerp(C0[1], C1[1], t);
    const b = lerp(C0[2], C1[2], t);
    if (inBar(x, y)) px(x, y, 255, 255, 255, 255);
    else px(x, y, r, g, b, 255);
  }
}

// --- minimal PNG encoder ---------------------------------------------------
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

// Add filter byte (0) per scanline.
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  buf.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const idat = deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
