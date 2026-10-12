#!/usr/bin/env python3
"""Write each host's `## Smoke status` section in docs/hosts/<note>.md from the smoke JSON.

Usage: python3 tests/smoke/host-notes.py [--json docs/releases/v<version>-smoke.json] [--hosts docs/hosts]

The section is the last one in every support note; everything after its heading is replaced.
The default JSON is the current release's (the version in .claude-plugin/plugin.json). When that
release has an install record (docs/releases/v<version>-installs.md), each section opens with it.
"""
import argparse
import json
import os
import re

from report import fmt_secs, mask   # the same directory; report.py owns the table formatting

NOTES = {"claude": "claude-code.md", "codex": "codex.md", "agy": "antigravity.md", "grok": "grok-build.md",
         "pi": "pi.md", "cursor-agent": "cursor-cli.md", "hermes": "hermes.md", "amp": "amp.md"}
CELLS = ["discovery", "canary", "hooks", "manual-only", "build", "helpers-off", "effort", "review", "debug",
         "tdd-override", "brainstorm-override", "ship", "team", "upgrade"]


def current_version():
    with open(".claude-plugin/plugin.json", encoding="utf-8") as fh:
        return json.load(fh)["version"]


def section(host, doc, release):
    entry = (doc.get("hosts") or {}).get(host) or {}
    cells = entry.get("cells") or {}
    smoke = "docs/releases/v%s-smoke.md" % release
    installs = "docs/releases/v%s-installs.md" % release
    lines = []
    if os.path.exists(installs):
        lines += ["Install: the v%s install record ([%s](%s)) shows this tool installing Agent Blueprint by its own route "
                  "and listing each skill once." % (release, installs, os.path.relpath(installs, "docs/hosts")), ""]
    if not cells:
        if not lines:
            return "Pending: the v%s smoke table (%s) fills this section.\n" % (release, smoke)
        return "\n".join(lines)
    lines += ["From the v%s smoke table ([%s](%s)), host version %s, last cell %s." % (
        release, smoke, os.path.relpath(smoke, "docs/hosts"), entry.get("version") or "unknown",
        max((c.get("date") or "") for c in cells.values())[:10]), ""]
    lines += ["| Cell | State | Time | Reason |", "|------|-------|------|--------|"]
    for cell in CELLS:
        c = cells.get(cell)
        if not c:
            continue
        reason = mask(c.get("reason") or "").replace("|", "\\|")   # a JSON written before masking still has local paths
        reason = re.sub(r" · work: \S+", "", reason)
        if c.get("link"):
            reason += " ([upstream issue](%s))" % c["link"]
        lines.append("| `%s` | %s | %s | %s |" % (cell, c.get("state", ""), fmt_secs(c.get("seconds")), reason[:220]))
    if any(c.get("state") == "fail" for c in cells.values()):
        lines += ["", "A `fail` cell blocks the release until it passes or is confirmed as a vendor bug (then it renders `degraded (vendor bug)` with the upstream link; see `docs/releases/v%s-checklist.md`)." % release]
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json", default=None)
    ap.add_argument("--hosts", default="docs/hosts")
    args = ap.parse_args()
    doc = json.load(open(args.json or "docs/releases/v%s-smoke.json" % current_version(), encoding="utf-8"))
    release = doc.get("release") or current_version()
    for host, note in NOTES.items():
        path = os.path.join(args.hosts, note)
        text = open(path, encoding="utf-8").read()
        head, sep, _ = text.partition("## Smoke status\n")
        if not sep:
            raise SystemExit("%s has no '## Smoke status' section" % path)
        text = section(host, doc, release)
        open(path, "w", encoding="utf-8").write(head + sep + "\n" + text)
        print("%-12s %s" % (host, "pending" if text.startswith("Pending:") else "written"))


if __name__ == "__main__":
    main()
