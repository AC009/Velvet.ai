import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = "C:/Users/ari20/.cursor/projects/c-velvet/assets";
const destDir = join(root, "public", "icons");
const files = ["icon-192.png", "icon-512.png", "apple-touch-icon.png"];

mkdirSync(destDir, { recursive: true });

for (const f of files) {
  const from = join(srcDir, f);
  const to = join(destDir, f);
  if (existsSync(from)) {
    copyFileSync(from, to);
    console.log(`copied ${f}`);
  } else {
    console.log(`missing source ${f}`);
  }
}

if (files.some((f) => !existsSync(join(destDir, f)))) {
  console.log("running generate-pwa-icons.mjs");
  execFileSync(process.execPath, [join(root, "scripts", "generate-pwa-icons.mjs")], {
    stdio: "inherit",
  });
}

const lines = files.map((f) => {
  const p = join(destDir, f);
  const ok = existsSync(p);
  const size = ok ? statSync(p).size : "N/A";
  return `${f}: exists=${ok} size=${size} bytes`;
});

writeFileSync(join(destDir, "READY.txt"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
console.log("DONE_COPY_ICONS");
