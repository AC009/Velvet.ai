/**
 * Generates solid fialová PWA placeholder icons into public/icons/.
 * Run: node scripts/generate-pwa-icons.mjs
 */
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "icons");

/** Velvet fialová — #a855f7 */
const R = 0xa8;
const G = 0x55;
const B = 0xf7;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(size, fileName) {
  // Soft inset margin so icons aren’t edge-bleeding on maskable shells.
  const margin = Math.max(2, Math.round(size * 0.08));
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0; // filter none
    for (let x = 0; x < size; x += 1) {
      const inside =
        x >= margin && x < size - margin && y >= margin && y < size - margin;
      const i = 1 + x * 3;
      if (inside) {
        row[i] = R;
        row[i + 1] = G;
        row[i + 2] = B;
      } else {
        // Near-black velvet frame
        row[i] = 0x07;
        row[i + 1] = 0x04;
        row[i + 2] = 0x0f;
      }
    }
    rows.push(row);
  }

  const raw = Buffer.concat(rows);
  const compressed = deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  const outPath = join(OUT_DIR, fileName);
  writeFileSync(outPath, png);
  const hash = createHash("sha256").update(png).digest("hex").slice(0, 12);
  console.log(`wrote ${fileName} (${size}x${size}) sha256:${hash}`);
}

mkdirSync(OUT_DIR, { recursive: true });
writePng(192, "icon-192.png");
writePng(512, "icon-512.png");
writePng(180, "apple-touch-icon.png");
console.log("PWA icons ready in public/icons/");
