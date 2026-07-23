import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "icons");
fs.mkdirSync(outDir, { recursive: true });

const R = 0xa8, G = 0x55, B = 0xf7;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(size) {
  const margin = Math.max(2, Math.round(size * 0.08));
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const inside = x >= margin && x < size - margin && y >= margin && y < size - margin;
      const i = 1 + x * 3;
      if (inside) { row[i]=R; row[i+1]=G; row[i+2]=B; }
      else { row[i]=0x07; row[i+1]=0x04; row[i+2]=0x0f; }
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const files = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
];

for (const [name, size] of files) {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, png(size));
}

fs.writeFileSync(
  path.join(outDir, "READY.txt"),
  files.map(([n,s]) => `${n} size=${s} bytes=${fs.statSync(path.join(outDir,n)).size}`).join("\n"),
);
