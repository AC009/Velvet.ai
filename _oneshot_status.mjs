/**
 * One-shot: generate icons, run tsc, write _final_status.txt
 */
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(root, "public", "icons");
const R = 0xa8, G = 0x55, B = 0xf7;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
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
  const margin = Math.max(2, Math.round(size * 0.08));
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0;
    for (let x = 0; x < size; x += 1) {
      const inside = x >= margin && x < size - margin && y >= margin && y < size - margin;
      const i = 1 + x * 3;
      if (inside) {
        row[i] = R; row[i + 1] = G; row[i + 2] = B;
      } else {
        row[i] = 0x07; row[i + 1] = 0x04; row[i + 2] = 0x0f;
      }
    }
    rows.push(row);
  }
  const compressed = deflateSync(Buffer.concat(rows));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(join(OUT_DIR, fileName), png);
}

mkdirSync(OUT_DIR, { recursive: true });
writePng(192, "icon-192.png");
writePng(512, "icon-512.png");
writePng(180, "apple-touch-icon.png");

const icons = [
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/icons/apple-touch-icon.png",
].map((p) => join(root, p));

const iconsOk = icons.every((p) => existsSync(p));
let tscCode = 0;
let tscOut = "";
try {
  tscOut = execSync("node node_modules/typescript/bin/tsc --noEmit", {
    cwd: root,
    encoding: "utf8",
  });
} catch (e) {
  tscCode = e.status ?? 1;
  tscOut = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  writeFileSync(join(root, "_tsc_full.txt"), tscOut);
}

const status = [
  `icons ok? ${iconsOk}`,
  `tsc exit code: ${tscCode}`,
  `fixes made: none`,
].join("\n") + "\n";

writeFileSync(join(root, "_final_status.txt"), status);
writeFileSync(
  join(root, "_icon_check.txt"),
  icons.map((p) => `${p}: ${existsSync(p) ? statSync(p).size : "MISSING"}`).join("\n") + "\n",
);
writeFileSync(join(root, "_oneshot_done.txt"), `ok icons=${iconsOk} tsc=${tscCode}\n`);
