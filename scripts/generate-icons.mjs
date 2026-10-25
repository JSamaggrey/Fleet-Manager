// Generates the PWA PNG icons in public/ without image tooling dependencies.
// Run with: node scripts/generate-icons.mjs
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const NAVY = [30, 58, 95];
const WHITE = [255, 255, 255];

/** Returns [r, g, b, a] for a point in unit coordinates. `full` = maskable (no rounded corners). */
function shade(x, y, full) {
  if (!full) {
    const r = 0.18; // corner radius
    const cx = Math.min(Math.max(x, r), 1 - r);
    const cy = Math.min(Math.max(y, r), 1 - r);
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return [0, 0, 0, 0];
  }
  const inRect = (x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const dist = (px, py) => Math.hypot(x - px, y - py);
  const wheels = [
    [0.33, 0.655],
    [0.69, 0.655],
  ];
  for (const [wx, wy] of wheels) {
    if (dist(wx, wy) <= 0.032) return [...NAVY, 255];
    if (dist(wx, wy) <= 0.078) return [...WHITE, 255];
  }
  const cargo = inRect(0.2, 0.33, 0.57, 0.61);
  const cab = inRect(0.6, 0.43, 0.8, 0.61);
  const window = inRect(0.64, 0.47, 0.76, 0.53);
  if (cargo || (cab && !window)) return [...WHITE, 255];
  return [...NAVY, 255];
}

function png(size, full) {
  const samples = 4;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4); // filter byte 0 + RGBA
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const c = shade(
            (px + (sx + 0.5) / samples) / size,
            (py + (sy + 0.5) / samples) / size,
            full,
          );
          acc[0] += c[0] * c[3];
          acc[1] += c[1] * c[3];
          acc[2] += c[2] * c[3];
          acc[3] += c[3];
        }
      }
      const a = acc[3] / (samples * samples);
      const o = 1 + px * 4;
      row[o] = a ? Math.round(acc[0] / acc[3]) : 0;
      row[o + 1] = a ? Math.round(acc[1] / acc[3]) : 0;
      row[o + 2] = a ? Math.round(acc[2] / acc[3]) : 0;
      row[o + 3] = Math.round(a);
    }
    rows.push(row);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outputs = [
  ['public/pwa-192x192.png', 192, false],
  ['public/pwa-512x512.png', 512, false],
  ['public/pwa-maskable-512x512.png', 512, true],
  ['public/apple-touch-icon-180x180.png', 180, true],
];
for (const [file, size, full] of outputs) {
  writeFileSync(file, png(size, full));
  console.log(`wrote ${file}`);
}
