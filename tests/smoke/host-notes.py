#!/usr/bin/env python3
"""Write each host's `## Smoke status` section in docs/hosts/<note>.md from the smoke JSON.

Usage: python3 tests/smoke/host-notes.py [--json docs/releases/v4.0.0-smoke.json] [--hosts docs/hosts]

The section is the last one in every support note; everything after its heading is replaced.
A host with no cells recorded keeps the pending line.
"""
import argparse
import json
import os
import re

NOTES = {"claude": "claude-code.md", "codex": "codex.md", "agy": "antigravity.md", "grok": "grok-build.md",
         "pi": "pi.md", "cursor-agent": "cursor-cli.md", "hermes": "hermes.md", "amp": "amp.md"}
CELLS = ["discovery", "canary", "hooks", "manual-only", "build", "helpers-off", "effort", "review", "debug", "ship", "team", "upgrade"]
PENDING = "Pending: the v4.0.0 smoke table (docs/releases/v4.0.0-smoke.md) fills this section.\n"


def fmt_secs(s):
    try:
        s = int(s)
    except (TypeError, ValueError):
        return ""
    return "%dm%02ds" % (s // 60, s % 60) if s >= 60 else "%ds" % s


def section(host, doc):
    entry = (doc.get("hosts") or {}).get(host) or {}
    cells = entry.get("cells") or {}
    if not cells:
        return PENDING
    rel = os.path.relpath("docs/releases/v4.0.0-smoke.md", "docs/hosts")
    lines = ["From the v4.0.0 smoke table ([%s](%s)), host version %s, last cell %s." % (
        "docs/releases/v4.0.0-smoke.md", rel, entry.get("version") or "unknown",
        max((c.get("date") or "") for c in cells.values())[:10]), ""]
    lines += ["| Cell | State | Time | Reason |", "|------|-------|------|--------|"]
    for cell in CELLS:
        c = cells.get(cell)
        if not c:
            continue
        reason = (c.get("reason") or "").replace("|", "\\|")
        reason = re.sub(r" · work: \S+", "", reason)
        if c.get("link"):
            reason += " ([upstream issue](%s))" % c["link"]
        lines.append("| `%s` | %s | %s | %s |" % (cell, c.get("state", ""), fmt_secs(c.get("seconds")), reason[:220]))
    states = [c.get("state") for c in cells.values()]
    if all(s == "not-installed" for s in states):
        lines += ["", "The tool is not installed on the build machine, so nothing ran; the adapter row in `hosts.sh` follows the vendor docs and is unverified."]
    elif any(s == "fail" for s in states):
        lines += ["", "A `fail` cell blocks the release until it passes or is confirmed as a vendor bug (then it renders `degraded (vendor bug)` with the upstream link; see `docs/releases/v4.0.0-checklist.md`)."]
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json", default="docs/releases/v4.0.0-smoke.json")
    ap.add_argument("--hosts", default="docs/hosts")
    args = ap.parse_args()
    doc = json.load(open(args.json, encoding="utf-8"))
    for host, note in NOTES.items():
        path = os.path.join(args.hosts, note)
        text = open(path, encoding="utf-8").read()
        head, sep, _ = text.partition("## Smoke status\n")
        if not sep:
            raise SystemExit("%s has no '## Smoke status' section" % path)
        open(path, "w", encoding="utf-8").write(head + sep + "\n" + section(host, doc))
        print("%-12s %s" % (host, "pending" if section(host, doc) == PENDING else "written"))


if __name__ == "__main__":
    main()
