from __future__ import annotations

import argparse
import re
from pathlib import Path


_IMG_RE = re.compile(r"^\\s*!\\[[^\\]]*\\]\\(([^)]+)\\)\\s*$")


def _sanitize_text(text: str) -> tuple[str, int]:
    out_lines: list[str] = []
    n = 0
    for line in text.splitlines():
        m = _IMG_RE.match(line)
        if m:
            path = m.group(1).strip()
            out_lines.append(f"- [{path}]({path})")
            n += 1
        else:
            out_lines.append(line)
    return "\\n".join(out_lines) + ("\\n" if text.endswith("\\n") else ""), n


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="sanitize_runs_markdown",
        description="Replace embedded Markdown images in runs/**/{summary,report}.md with links.",
    )
    parser.add_argument("--root", default="runs", help="Root directory to scan (default: runs).")
    parser.add_argument(
        "--write",
        action="store_true",
        help="Rewrite files in place (otherwise just report and exit non-zero if issues found).",
    )
    args = parser.parse_args(argv)

    root = Path(str(args.root))
    if not root.exists():
        print(f"Missing root: {root}")
        return 2

    paths = sorted(set([*root.rglob("summary.md"), *root.rglob("report.md")]))
    total = 0
    touched = 0
    for p in paths:
        try:
            text = p.read_text()
        except Exception:
            continue
        new_text, n = _sanitize_text(text)
        if n <= 0:
            continue
        total += n
        print(f"{p}: {n} embedded image(s)")
        if args.write:
            p.write_text(new_text)
            touched += 1

    if total == 0:
        print("OK: no embedded images found.")
        return 0

    if args.write:
        print(f"Rewrote {touched} file(s); replaced {total} embedded image(s).")
        return 0

    print(f"Found {total} embedded image(s). Re-run with --write to fix.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

