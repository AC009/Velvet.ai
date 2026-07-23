import pathlib, re, json, subprocess

r = subprocess.run(
    ["npx", "tsc", "--noEmit", "--pretty", "false"],
    cwd=r"c:\velvet",
    capture_output=True,
    text=True,
    shell=True,
)
text = (r.stdout or "") + "\n" + (r.stderr or "")
pathlib.Path(r"c:\velvet\typecheck-out.log").write_text(
    text + f"\nEXIT={r.returncode}\n", encoding="utf-8"
)

err_re = re.compile(
    r"^(?P<file>[^(]+)\((?P<line>\d+),(?P<col>\d+)\): error (?P<code>TS\d+): (?P<msg>.*)$"
)
errors = []
for ln in text.splitlines():
    m = err_re.match(ln.strip())
    if m:
        errors.append(m.groupdict())

targets = [
    "app/components/MissionGate.tsx",
    "app/page.tsx",
    "lib/empathy/engine.ts",
    "lib/frontend/empathy-client.ts",
    "lib/frontend/verify-mission.ts",
    "lib/chat/rpg-session-store.ts",
    "app/api/verify-mission/route.ts",
    "app/api/empathy/checkin/route.ts",
]

def norm(p: str) -> str:
    return p.replace("\\", "/").lower()

target_set = [norm(t) for t in targets]
target_errors = []
other_errors = []
for e in errors:
    f = norm(e["file"])
    if f.startswith("c:/velvet/"):
        f = f[len("c:/velvet/") :]
    matched = any(f.endswith(t) or t in f for t in target_set)
    if matched:
        target_errors.append(e)
    else:
        other_errors.append(e)

report = {
    "exit": r.returncode,
    "total_errors": len(errors),
    "target_errors": target_errors,
    "other_error_count": len(other_errors),
    "other_errors_sample": other_errors[:40],
    "all_error_files": sorted({norm(e["file"]) for e in errors}),
}
pathlib.Path(r"c:\velvet\typecheck-report.json").write_text(
    json.dumps(report, indent=2), encoding="utf-8"
)

lines = [f"# Typecheck exit {r.returncode}", f"Total errors: {len(errors)}", "", f"## Target file errors ({len(target_errors)})", ""]
for e in target_errors:
    lines.append(f"- {e['file']}({e['line']},{e['col']}): {e['code']}: {e['msg']}")
lines += ["", f"## Other errors sample ({len(other_errors)} total)", ""]
for e in other_errors[:40]:
    lines.append(f"- {e['file']}({e['line']},{e['col']}): {e['code']}: {e['msg']}")
pathlib.Path(r"c:\velvet\TYPECHECK_ERRORS.md").write_text("\n".join(lines), encoding="utf-8")
print("OK", r.returncode, len(errors), len(target_errors))
