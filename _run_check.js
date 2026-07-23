const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const root = "c:/velvet";
const log = [];
function run(cmd) {
  try {
    const out = execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    log.push(`OK: ${cmd}`);
    if (out) log.push(out.slice(0, 2000));
    return { ok: true, out, code: 0 };
  } catch (e) {
    log.push(`FAIL: ${cmd} code=${e.status}`);
    if (e.stdout) log.push(String(e.stdout).slice(0, 4000));
    if (e.stderr) log.push(String(e.stderr).slice(0, 4000));
    return { ok: false, out: String(e.stdout || ""), err: String(e.stderr || ""), code: e.status ?? 1 };
  }
}
const gen = run("node scripts/generate-pwa-icons.mjs");
const icons = [
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/icons/apple-touch-icon.png",
];
const missing = icons.filter((p) => !fs.existsSync(path.join(root, p)));
const iconsOk = missing.length === 0;
log.push(`iconsOk=${iconsOk} missing=${missing.join(",") || "none"}`);
const tsc = run("npx tsc --noEmit");
fs.writeFileSync(path.join(root, "_run_log.txt"), log.join("\n"), "utf8");
fs.writeFileSync(
  path.join(root, "_tsc_full.txt"),
  (tsc.out || "") + "\n" + (tsc.err || ""),
  "utf8"
);
fs.writeFileSync(
  path.join(root, "_final_status.txt"),
  [
    `icons ok? ${iconsOk}`,
    `tsc exit code: ${tsc.code}`,
    `fixes made: none (pending review of tsc output)`,
    gen.ok ? "icon gen: ok" : "icon gen: failed",
    missing.length ? `missing icons: ${missing.join(", ")}` : "all three icon files present",
  ].join("\n"),
  "utf8"
);
console.log("DONE");
console.log(fs.readFileSync(path.join(root, "_final_status.txt"), "utf8"));
