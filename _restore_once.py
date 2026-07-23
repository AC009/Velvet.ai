import subprocess
import pathlib
import re

cwd = pathlib.Path(r"c:\velvet")
out_path = cwd / "lib" / "chat" / "conversation-store.orig.ts"
report = cwd / "_restore_report.txt"

r = subprocess.run(
    ["git", "--no-pager", "show", "HEAD:lib/chat/conversation-store.ts"],
    cwd=cwd,
    capture_output=True,
)

if r.returncode != 0 or len(r.stdout) == 0:
    # fallback: cat-file
    oid = subprocess.run(
        ["git", "rev-parse", "HEAD:lib/chat/conversation-store.ts"],
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    report.write_text(
        f"show_rc={r.returncode}\nshow_stdout_len={len(r.stdout)}\nshow_stderr={r.stderr!r}\noid_rc={oid.returncode}\noid={oid.stdout!r}\noid_err={oid.stderr!r}\n",
        encoding="utf-8",
    )
    if oid.returncode == 0:
        oid_s = oid.stdout.strip()
        blob = subprocess.run(
            ["git", "cat-file", "blob", oid_s],
            cwd=cwd,
            capture_output=True,
        )
        data = blob.stdout
        report.write_text(
            report.read_text(encoding="utf-8")
            + f"cat_rc={blob.returncode}\ncat_len={len(data)}\ncat_err={blob.stderr!r}\n",
            encoding="utf-8",
        )
    else:
        data = r.stdout
else:
    data = r.stdout

out_path.write_bytes(data)
text = data.decode("utf-8", errors="replace")
# Count lines like wc -l (newline count); also report splitlines length
newline_count = text.count("\n")
split_lines = text.splitlines()
exports = re.findall(r"^export\s+(?:async\s+)?function\s+(\w+)", text, re.M)
also = re.findall(r"^export\s+(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(", text, re.M)
report.write_text(
    f"bytes={len(data)}\nnewline_count={newline_count}\nsplitlines={len(split_lines)}\nexport_functions={exports}\nexport_const_fns={also}\npath={out_path}\nexists={out_path.exists()}\n",
    encoding="utf-8",
)
print("WROTE_REPORT")
