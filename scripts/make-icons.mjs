// Generates extension icons (no dependencies): gradient rounded square with a white "C" ring and a spark.
// Usage: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../extension/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// Shape tests in unit space [0,1].
const A = [91, 75, 255]; // #5b4bff
const B = [25, 184, 212]; // #19b8d4
function sample(u, v) {
  // Rounded square background
  const r = 0.22, m = 0.02;
  const qx = Math.max(Math.abs(u - 0.5) - (0.5 - m - r), 0);
  const qy = Math.max(Math.abs(v - 0.5) - (0.5 - m - r), 0);
  if (Math.hypot(qx, qy) > r) return null;

  // "C" ring, opening to the right
  const cx = 0.47, cy = 0.5;
  const d = Math.hypot(u - cx, v - cy);
  const ang = Math.atan2(v - cy, u - cx);
  const inRing = d > 0.19 && d < 0.3 && Math.abs(ang) > 0.75;
  // Spark (4-point star) in the opening
  const sx = u - 0.72, sy = v - 0.5;
  const spark = Math.abs(sx) ** 0.6 + Math.abs(sy) ** 0.6 < 0.33 ** 0.6 * 1.05 && Math.abs(sx) + Math.abs(sy) < 0.14;
  if (inRing || spark) return [255, 255, 255];

  const t = (u + v) / 2;
  return A.map((a, i) => Math.round(a + (B[i] - a) * t));
}

for (const size of [16, 32, 48, 128]) {
  const ss = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rr = 0, gg = 0, bb = 0, aa = 0;
      for (let j = 0; j < ss; j++) {
        for (let i = 0; i < ss; i++) {
          const c = sample((x + (i + 0.5) / ss) / size, (y + (j + 0.5) / ss) / size);
          if (c) { rr += c[0]; gg += c[1]; bb += c[2]; aa++; }
        }
      }
      const o = (y * size + x) * 4;
      if (aa) {
        buf[o] = Math.round(rr / aa);
        buf[o + 1] = Math.round(gg / aa);
        buf[o + 2] = Math.round(bb / aa);
      }
      buf[o + 3] = Math.round((aa / (ss * ss)) * 255);
    }
  }
  writeFileSync(new URL(`icon${size}.png`, OUT), png(size, buf));
}
console.log('icons written to extension/icons/');
