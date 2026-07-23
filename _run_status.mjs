import { existsSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const icons = [
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/icons/apple-touch-icon.png",
];

try {
  execSync("node scripts/generate-pwa-icons.mjs", { stdio: "inherit" });
} catch {
  // continue; status will reflect missing icons
}

const iconsOk = icons.every((p) => existsSync(p));
let tscCode = 0;
try {
  execSync("node node_modules/typescript/bin/tsc --noEmit", { stdio: "pipe" });
} catch (e) {
  tscCode = e.status ?? 1;
  writeFileSync(
    "_tsc_full.txt",
    `${e.stdout?.toString?.() ?? ""}${e.stderr?.toString?.() ?? ""}`,
  );
}

writeFileSync(
  "_final_status.txt",
  [
    `icons ok? ${iconsOk}`,
    `tsc exit code: ${tscCode}`,
    `fixes made: none`,
  ].join("\n") + "\n",
);

writeFileSync(
  "_icon_check.txt",
  icons
    .map((p) => `${p}: ${existsSync(p) ? statSync(p).size : "MISSING"}`)
    .join("\n") + "\n",
);

console.log(iconsOk ? "icons ok" : "icons missing");
console.log("tsc", tscCode);
process.exit(iconsOk && tscCode === 0 ? 0 : 1);
