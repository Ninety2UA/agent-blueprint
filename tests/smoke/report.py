#!/usr/bin/env python3
"""report.py — merges smoke and eval results into their JSON files and renders the Markdown.

    report.py smoke --version V --json FILE --md FILE --results results.jsonl --versions versions.tsv
                    --command "..." --plugin-dir PATH --hosts "h1 h2" --cells "c1 c2"
    report.py eval  --version V --json FILE --md FILE --results results.jsonl --command "..."
                    --v3-dir PATH --v4-dir PATH --runs N --tasks "t1 t2"

Standard library only. The smoke JSON keeps one entry per host and cell, so several partial runs
(--host, --cell) build one table; a later run replaces the same host+cell. The eval JSON keeps every
run, so a second invocation adds to the sample. Both JSONs are committed, so every string they keep
has local paths masked (see mask); the per-run results.jsonl holds the real ones.
"""
import argparse
import datetime
import json
import os
import re
import statistics
import sys

STATES = [
    ("pass", "the outcome check held (and the skill's provenance record exists for pipeline cells)"),
    ("degraded-pass (inline)", "the check held, but every helper step ran inline (no subagents on this host or in this run)"),
    ("degraded (vendor bug)", "the check failed because of a confirmed vendor bug; the link points at the upstream issue"),
    ("fail", "the check failed, the provenance record is missing, the host exited early, or preflight failed"),
    ("timeout", "the host did not finish within the cell's timeout (hosts.sh, or --timeout)"),
    ("not-installed", "the host CLI is not on PATH; nothing ran"),
    ("n/a", "the cell does not apply to this host (the reason says why)"),
]


HOME = os.path.expanduser("~")
HOME_RE = re.compile(re.escape(HOME) + r"(?![\w.-])") if HOME not in ("", "/", "~") else None
# Temp roots (longest first, so $TMPDIR wins over /var/folders): a path under one of them is unreachable
# for any reader and can carry the account name (a session scratch dir under /private/tmp does).
TMP_ROOTS = sorted({p.rstrip("/") for p in (os.environ.get("TMPDIR", ""), "/private/var/folders", "/var/folders",
                                            "/private/tmp", "/tmp") if p.rstrip("/")}, key=len, reverse=True)
TMP_RE = re.compile(r"(?<![\w./-])(?:%s)(?P<rest>/[^\s\"'()|;,]*[^\s\"'()|;,.:])"
                    % "|".join(re.escape(p) for p in TMP_ROOTS))


def mask(value):
    """Local paths in a string bound for the committed JSON: $HOME becomes ~, and a path under a temp
    root keeps only its last component, as $TMPDIR/name or $TMPDIR/.../name. Non-strings pass through."""
    if not isinstance(value, str):
        return value
    if HOME_RE:
        value = HOME_RE.sub("~", value)

    def short(m):
        parts = m.group("rest").strip("/").split("/")
        return "$TMPDIR/" + (".../" if len(parts) > 1 else "") + parts[-1]
    return TMP_RE.sub(short, value)


def mask_doc(node):
    """mask() every string in a JSON document, in place, so a run also cleans rows already on disk."""
    if isinstance(node, dict):
        for k in node:
            node[k] = mask_doc(node[k])
        return node
    if isinstance(node, list):
        node[:] = [mask_doc(v) for v in node]
        return node
    return mask(node)


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def load_json(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def save_json(path, doc):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=2, sort_keys=True)
        fh.write("\n")


def read_results(path):
    rows = []
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    except OSError:
        pass
    return rows


def prose(text):
    """Reason text for a Markdown cell: one line, pipes escaped, bare URLs in angle brackets (MD034)."""
    text = (text or "").replace("\n", " ").replace("|", "/")
    return re.sub(r"(?<![<(])(https?://[^\s<>)]+)", r"<\1>", text)


def fmt_secs(s):
    """Seconds as 7s or 2m05s; empty when the value is missing or not a number."""
    try:
        s = int(s)
    except (TypeError, ValueError):
        return ""
    if s < 60:
        return "%ds" % s
    return "%dm%02ds" % (s // 60, s % 60)


def fmt_tokens(t):
    if t is None:
        return "n/a"
    if t >= 1000000:
        return "%.1fM" % (t / 1000000.0)
    if t >= 1000:
        return "%.0fk" % (t / 1000.0)
    return str(t)


# ── smoke ─────────────────────────────────────────────────────
def smoke(args):
    doc = load_json(args.json)
    doc.setdefault("release", args.version)
    doc.setdefault("hosts", {})
    doc.setdefault("runs", [])
    versions = {}
    try:
        with open(args.versions, encoding="utf-8") as fh:
            for line in fh:
                if "\t" in line:
                    h, v = line.rstrip("\n").split("\t", 1)
                    versions[h] = v
    except OSError:
        pass
    rows = read_results(args.results)
    touched_hosts = sorted({r["host"] for r in rows})
    for r in rows:
        host = doc["hosts"].setdefault(r["host"], {"version": "", "cells": {}})
        if r["host"] in versions:
            host["version"] = versions[r["host"]]
        cell = {k: r.get(k) for k in ("state", "seconds", "tokens", "cost_usd", "log", "reason", "date", "link", "session", "plugin_dir")}
        host["cells"][r["cell"]] = cell
    doc["runs"].append({"date": now(), "command": args.command, "plugin_dir": args.plugin_dir,
                        "hosts": touched_hosts, "cells": sorted({r["cell"] for r in rows})})
    doc["updated"] = now()
    mask_doc(doc)
    save_json(args.json, doc)

    hosts = [h for h in args.hosts.split() if h in doc["hosts"]] + sorted(h for h in doc["hosts"] if h not in args.hosts.split())
    cells = args.cells.split()
    out = []
    out.append("# Smoke test: Agent Blueprint v%s" % args.version)
    out.append("")
    out.append("One row per host, one column per cell; each cell shows its state and wall time. Generated by")
    out.append("`tests/smoke/run-smoke.sh` on the maintainer's machine (never in CI); `tests/smoke/README.md` says what")
    out.append("each cell proves. Details for every cell, with tokens, cost, log path and reason, are in")
    out.append("`v%s-smoke.json`." % args.version)
    out.append("")
    out.append("Last updated: %s" % doc["updated"])
    out.append("")
    out.append("## Table")
    out.append("")
    out.append("| Host | " + " | ".join(cells) + " |")
    out.append("|------|" + "|".join("---" for _ in cells) + "|")
    for h in hosts:
        row = []
        for c in cells:
            cell = doc["hosts"][h]["cells"].get(c)
            if not cell:
                row.append("—")
                continue
            state = cell.get("state") or "?"
            link = cell.get("link")
            label = "[%s](%s)" % (state, link) if link and state.startswith("degraded (") else state
            secs = fmt_secs(cell.get("seconds"))
            row.append(label + (" " + secs if secs and state not in ("n/a", "not-installed") else ""))
        out.append("| %s | " % h + " | ".join(row) + " |")
    out.append("")
    out.append("## Legend")
    out.append("")
    for state, meaning in STATES:
        out.append("- `%s`: %s" % (state, meaning))
    out.append("")
    out.append("## Hosts")
    out.append("")
    out.append("| Host | Version | Cells recorded |")
    out.append("|------|---------|----------------|")
    for h in hosts:
        info = doc["hosts"][h]
        out.append("| %s | %s | %d |" % (h, info.get("version") or "?", len(info.get("cells", {}))))
    out.append("")
    out.append("## Runs")
    out.append("")
    for run in doc["runs"]:
        out.append("- %s: `%s` (hosts: %s)" % (run["date"], run["command"], ", ".join(run.get("hosts") or []) or "none"))
    out.append("")
    out.append("## Reasons")
    out.append("")
    out.append("Every cell that is not `pass`, with its reason (the JSON holds all of them).")
    out.append("")
    any_reason = False
    for h in hosts:
        for c in cells:
            cell = doc["hosts"][h]["cells"].get(c)
            if cell and cell.get("state") != "pass" and cell.get("reason"):
                any_reason = True
                out.append("- **%s · %s** (`%s`): %s" % (h, c, cell["state"], prose(cell["reason"])))
    if not any_reason:
        out.append("- (none)")
    out.append("")
    with open(args.md, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out))


# ── eval ──────────────────────────────────────────────────────
def median(values):
    values = [v for v in values if v is not None]
    return statistics.median(values) if values else None


def eval_report(args):
    doc = load_json(args.json)
    doc.setdefault("release", args.version)
    doc.setdefault("runs", [])
    rows = read_results(args.results)
    doc["runs"].extend(rows)
    doc.setdefault("invocations", []).append({"date": now(), "command": args.command, "v3_dir": args.v3_dir,
                                             "v4_dir": args.v4_dir, "runs_per_task": args.runs})
    doc["updated"] = now()
    mask_doc(doc)
    save_json(args.json, doc)

    tasks = args.tasks.split()
    out = []
    out.append("# Evaluation: v3.8.0 against v%s on Claude Code" % args.version)
    out.append("")
    out.append("Four fixture tasks, each run N times on the v3.8.0 plugin and on v%s (U17 step 1). A task passes when" % args.version)
    out.append("its outcome check holds (the same checks as the smoke test). An outcome regression is a task that")
    out.append("passes on v3.8.0 and fails on v%s in the majority of runs. Tokens count every input, cache and" % args.version)
    out.append("output token the host reported; cost is Claude Code's `total_cost_usd`. Generated by")
    out.append("`tests/smoke/eval.sh`; every run is in `v%s-eval.json`." % args.version)
    out.append("")
    out.append("Last updated: %s" % doc["updated"])
    out.append("")
    out.append("| Task | v3.8.0 passes | v%s passes | v3 median time | v%s median time | v3 median tokens | v%s median tokens | v3 median cost | v%s median cost | Regression |"
               % (args.version, args.version, args.version, args.version))
    out.append("|------|---------------|------------|----------------|-----------------|------------------|-------------------|----------------|-----------------|------------|")
    increases = []
    by_task = {}
    for r in doc["runs"]:
        by_task.setdefault(r["task"], {"v3": [], "v4": []}).setdefault(r["version"], []).append(r)
    for t in tasks:
        v3 = by_task.get(t, {}).get("v3", [])
        v4 = by_task.get(t, {}).get("v4", [])
        if not v3 and not v4:
            continue
        p3 = sum(1 for r in v3 if r["state"] == "pass")
        p4 = sum(1 for r in v4 if r["state"] == "pass")
        t3, t4 = median([r.get("seconds") for r in v3]), median([r.get("seconds") for r in v4])
        k3, k4 = median([r.get("tokens") for r in v3]), median([r.get("tokens") for r in v4])
        c3, c4 = median([r.get("cost_usd") for r in v3]), median([r.get("cost_usd") for r in v4])
        regression = bool(v3) and bool(v4) and p3 * 2 > len(v3) and p4 * 2 <= len(v4)
        for label, a, b in (("wall time", t3, t4), ("tokens", k3, k4), ("cost", c3, c4)):
            if a and b and b > a * 1.25:
                increases.append("%s: %s rose %.0f%% (v3 %s, v%s %s)" % (t, label, (b / a - 1) * 100, a, args.version, b))
        out.append("| %s | %d/%d | %d/%d | %s | %s | %s | %s | %s | %s | %s |" % (
            t, p3, len(v3), p4, len(v4), fmt_secs(t3), fmt_secs(t4), fmt_tokens(k3), fmt_tokens(k4),
            "%.2f" % c3 if c3 is not None else "n/a", "%.2f" % c4 if c4 is not None else "n/a",
            "**yes**" if regression else "no"))
    out.append("")
    out.append("## Increases above 25%")
    out.append("")
    out.append("For the release lead to explain in the release notes.")
    out.append("")
    out.extend("- " + line for line in increases) if increases else out.append("- (none)")
    out.append("")
    out.append("## Runs")
    out.append("")
    out.append("| Task | Version | Run | State | Time | Tokens | Cost | Reason |")
    out.append("|------|---------|-----|-------|------|--------|------|--------|")
    for r in doc["runs"]:
        out.append("| %s | %s | %s | %s | %s | %s | %s | %s |" % (
            r["task"], r["version"], r.get("run", ""), r["state"], fmt_secs(r.get("seconds")), fmt_tokens(r.get("tokens")),
            "%.2f" % r["cost_usd"] if r.get("cost_usd") is not None else "n/a", prose(r.get("reason"))[:160]))
    out.append("")
    with open(args.md, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="kind")
    sub.required = True
    s = sub.add_parser("smoke")
    for name in ("--version", "--json", "--md", "--results", "--versions", "--command", "--plugin-dir", "--hosts", "--cells"):
        s.add_argument(name, required=True)
    e = sub.add_parser("eval")
    for name in ("--version", "--json", "--md", "--results", "--command", "--v3-dir", "--v4-dir", "--tasks"):
        e.add_argument(name, required=True)
    e.add_argument("--runs", type=int, required=True)
    args = parser.parse_args()
    if args.kind == "smoke":
        smoke(args)
    else:
        eval_report(args)


if __name__ == "__main__":
    sys.exit(main())
