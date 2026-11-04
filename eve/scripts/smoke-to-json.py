#!/usr/bin/env python3
"""smoke-to-json.py: the Eve rows of the smoke record, from `eve eval --json` output (KTD15).

    python3 eve/scripts/smoke-to-json.py --version 4.2.0 --input mock.json [--input live.json ...]
                                         [--out docs/releases] [--md PATH] [--provider docker]

Run from the product root. Each --input is the stdout of `npx eve eval ... --json` (eve's log lines
before the JSON are skipped); a later input wins for the same eval. The rows merge into
docs/releases/v<version>-smoke.json as host `eve` through tests/smoke/report.py, which also renders
v<version>-smoke.md (or --md). Every one of the fourteen cells gets a row:

- discovery, hooks and manual-only from the mock-tagged evals; canary, build and review from the
  live-tagged evals on local Docker; ship from the live eval run with --url against the demo;
- a cell whose eval is not in the inputs keeps its earlier row, or is `pending` with the command
  that runs it;
- the seven cells Eve does not run are `n/a` with the reason;
- a cell whose skill is degraded on Eve (KTD14) is `degraded` with the reason.

Beside report.py's fields, a row that ran carries what report.py has no field for: `provenance`
(mock or live), `eval`, `tokens_by_model` (input, cache_read, cache_write, output per model; input
excludes the cache), `model_calls`, `subagent_calls`, `compactions` (history tokens and outcome
each), `provider` (the sandbox provider) and `sandbox_seconds` (the summed wall time of the tool
calls that run in the sandbox). Standard library only.
"""
import argparse
import datetime
import importlib.util
import json
import os
import shlex
import sys
import tempfile

PRODUCT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SMOKE = os.path.join(PRODUCT, "tests", "smoke")
sys.path.insert(0, SMOKE)
import report  # noqa: E402  (tests/smoke/report.py owns the smoke JSON and its merge)


def _host_notes():
    spec = importlib.util.spec_from_file_location("host_notes", os.path.join(SMOKE, "host-notes.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CELLS = _host_notes().CELLS
HOST = "eve"

# Cell: (eval id, tier). The tier says how a pass was reached and what a missing cell waits for.
EVALS = {
    "discovery": ("discovery", "mock"),
    "hooks": ("hooks", "mock"),
    "manual-only": ("manual-only", "mock"),
    "canary": ("canary", "live"),
    "build": ("build", "live"),
    "review": ("review", "live"),
    "ship": ("ship", "live"),
}
WAITS = {
    "mock": "AB_EVAL_MOCK=1 npx eve eval --tag mock --json (in eve/, Docker running)",
    "live": "waits for Gateway credits: npx eve eval {eval} --json (in eve/, AI_GATEWAY_API_KEY set, AB_EVAL_MOCK unset, Docker running)",
    "ship": ("waits for the demo deployment and Gateway credits: AB_SMOKE_SHIP_REPOSITORY=<github.com URL> "
             "npx eve eval ship --url <demo production URL> --json (in eve/)"),
}

# The seven cells Eve does not run (KTD15), with the reason each renders.
NOT_RUN = {
    "helpers-off": "no switch turns helpers off on Eve, so the inline path cannot be forced; the cell is n/a on hosts without one",
    "effort": "Claude Code only: the cell reads the effort field of Claude Code's helper transcripts",
    "debug": ("not one of Eve's smoke cells (KTD15: the live tier is canary, build, review and ship); "
              "ab-systematic-debugging loads from the same committed skills/ tree the discovery cell checks"),
    "tdd-override": ("not one of Eve's smoke cells (KTD15: the live tier is canary, build, review and ship); "
                     "ab-test-driven-development loads from the same committed skills/ tree the discovery cell checks"),
    "brainstorm-override": ("not one of Eve's smoke cells (KTD15: the live tier is canary, build, review and ship); "
                            "ab-brainstorming loads from the same committed skills/ tree the discovery cell checks"),
    "team": "Claude Code only: Agent Teams exist only there; helpers on Eve are root copies through the helper tool",
    "upgrade": "Claude Code only: the cell upgrades a v3.8.0 Claude Code plugin install; an Eve copy is upgraded by redeploying it",
}

# The skills degraded on Eve (KTD14); docs/hosts/eve.md gives each reason in full.
DEGRADED = {
    skill: "%s is degraded on Eve (KTD14); docs/hosts/eve.md says why" % skill
    for skill in ("ab-plugin-update", "ab-forensics", "ab-browser-testing", "ab-deployment-verification", "ab-health-check")
}

# Tools that run their work in the session's sandbox; their call time is the sandbox wall time.
SANDBOX_TOOLS = {"bash", "read_file", "write_file", "clone_repository", "publish_branch"}
# Tools that start a root copy of the agent (the helper arm, U1), counted with eve's subagent calls.
HELPER_TOOLS = {"helper"}


def load_report(path):
    """The JSON object in an `eve eval --json` stdout, after any log lines eve printed first."""
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    decoder = json.JSONDecoder()
    start = 0
    while True:
        at = text.find("{", start)
        if at < 0:
            raise SystemExit("%s holds no eve eval JSON report" % path)
        if at == 0 or text[at - 1] == "\n":
            try:
                doc, _ = decoder.raw_decode(text, at)
                if isinstance(doc, dict) and "results" in doc:
                    return doc
            except ValueError:
                pass
        start = at + 1


def stamp(iso):
    """eve's 2026-10-29T03:01:53.027Z as the smoke JSON's 2026-10-29T03:01:53Z."""
    return iso[:19] + "Z" if iso else None


def seconds_between(start, end):
    try:
        a = datetime.datetime.fromisoformat(start.replace("Z", "+00:00"))
        b = datetime.datetime.fromisoformat(end.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None
    return (b - a).total_seconds()


def measure(result, provider):
    """The KTD15 measurements of one eval result, from its sessions' events."""
    res = result.get("result") or {}
    derived = res.get("derived") or {}
    sessions = res.get("sessions") or [{"events": res.get("events") or []}]
    by_model, compactions = {}, []
    model_calls = 0
    sandbox = 0.0
    for session in sessions:
        models, requested, started, last_input = {}, {}, {}, None
        changes = {}
        for event in session.get("events") or []:
            kind, data = event.get("type"), event.get("data") or {}
            at = (event.get("meta") or {}).get("at")
            if kind == "model.started":
                models[data.get("runId")] = data.get("modelId") or "unknown"
            elif kind == "model.requested":
                model_calls += 1
            elif kind == "usage.recorded":
                owner, usage = data.get("owner") or {}, data.get("usage") or {}
                if "callId" in owner:
                    continue   # a delegated agent's spend: counted in its own session, or as unattributed below
                model = models.get(owner.get("runId"), "compaction" if "changeId" in owner else "unknown")
                total_in = usage.get("inputTokens") or 0
                read, write = usage.get("cacheReadTokens") or 0, usage.get("cacheWriteTokens") or 0
                bucket = by_model.setdefault(model, {"input": 0, "cache_read": 0, "cache_write": 0, "output": 0})
                bucket["input"] += total_in - read - write
                bucket["cache_read"] += read
                bucket["cache_write"] += write
                bucket["output"] += usage.get("outputTokens") or 0
                last_input = total_in
            elif kind == "context.started" and data.get("kind") == "compaction":
                trigger = data.get("trigger") or {}
                entry = {"history_tokens": trigger.get("inputTokens", last_input), "outcome": None}
                changes[data.get("changeId")] = entry
                compactions.append(entry)
            elif kind == "context.settled" and data.get("changeId") in changes:
                changes[data["changeId"]]["outcome"] = data.get("outcome")
            elif kind == "call.requested":
                capability = data.get("capability") or {}
                if capability.get("kind") == "tool" and capability.get("name") in SANDBOX_TOOLS:
                    requested[data.get("callId")] = True
            elif kind == "call.started" and data.get("callId") in requested:
                started[data["callId"]] = at
            elif kind == "call.settled" and data.get("callId") in started:
                sandbox += seconds_between(started.pop(data["callId"]), at) or 0.0
    usage = derived.get("usage") or {}
    total_in = usage.get("inputTokens") or 0
    counted = sum(b["input"] + b["cache_read"] + b["cache_write"] for b in by_model.values())
    if total_in > counted:
        # Spend of delegated sessions the eval did not capture: eve's total holds it, the events do not.
        read = (usage.get("cacheReadTokens") or 0) - sum(b["cache_read"] for b in by_model.values())
        write = (usage.get("cacheWriteTokens") or 0) - sum(b["cache_write"] for b in by_model.values())
        by_model["unattributed"] = {
            "input": total_in - counted - max(read, 0) - max(write, 0), "cache_read": max(read, 0), "cache_write": max(write, 0),
            "output": max((usage.get("outputTokens") or 0) - sum(b["output"] for b in by_model.values()), 0),
        }
    helpers = sum(1 for call in derived.get("toolCalls") or [] if call.get("name") in HELPER_TOOLS)
    return {
        "tokens": (total_in + (usage.get("outputTokens") or 0)) if usage else None,
        "cost_usd": usage.get("costUsd"),
        "tokens_by_model": by_model,
        "model_calls": model_calls,
        "subagent_calls": (derived.get("subagentCallCount") or 0) + helpers,
        "compactions": compactions,
        "provider": provider,
        "sandbox_seconds": round(sandbox, 1),
    }


def gates(result):
    checks = [a for a in result.get("assertions") or [] if a.get("severity", "gate") == "gate"]
    return sum(1 for a in checks if a.get("passed")), len(checks), [a for a in checks if not a.get("passed")]


def waits(cell, tier, eval_id):
    return WAITS["ship" if cell == "ship" else tier].format(eval=eval_id)


def ran_row(cell, tier, result, provider, source):
    """The row of a cell whose eval is in the inputs, with its measurements."""
    eval_id = result.get("id")
    verdict = result.get("verdict")
    passed, total, failed = gates(result)
    if verdict == "skipped":
        state = "pending"
        skipped = (result.get("skipReason") or "skipped").split("; waits for")[0]
        reason = "not run (%s); %s" % (skipped, waits(cell, tier, eval_id))
    elif verdict in ("passed", "scored"):
        state = "pass"
        reason = "%d of %d gates passed" % (passed, total)
        if tier == "mock":
            reason = "mock run (scripted model, no tokens spent, %s sandbox): %s" % (provider, reason)
    else:
        state = "fail"
        names = "; ".join("%s%s" % (a.get("name"), ": " + a["message"] if a.get("message") else "") for a in failed[:3])
        reason = "%s: %s" % (verdict or "failed", names or (result.get("error") or {}).get("message") or "see the eval artifact")
    res = result.get("result") or {}
    row = {"state": state, "reason": reason, "date": stamp(result.get("completedAt")),
           "seconds": None, "log": "%s#%s" % (source, eval_id), "link": "", "session": res.get("sessionId") or "",
           "plugin_dir": "skills/", "provenance": tier, "eval": eval_id}
    if state != "pending":
        secs = seconds_between(result.get("startedAt"), result.get("completedAt"))
        row["seconds"] = int(round(secs)) if secs is not None else None
        row.update(measure(result, provider))
    return row


def fixed_row(state, reason, now_iso, **extra):
    row = {"state": state, "reason": reason, "date": now_iso, "seconds": None, "tokens": None, "cost_usd": None,
           "log": "", "link": "", "session": "", "plugin_dir": "skills/"}
    row.update(extra)
    return row


def cell_skill(cell):
    path = os.path.join(SMOKE, "scenarios", cell, "skill")
    try:
        with open(path, encoding="utf-8") as fh:
            return fh.readline().strip() or None
    except OSError:
        return None


def degrade(row, skill):
    """A cell whose skill is degraded on Eve renders `degraded` with the reason, whatever its eval did."""
    if skill not in DEGRADED:
        return row
    row = dict(row)
    row["reason"] = "%s (the eval: %s, %s)" % (DEGRADED[skill], row.get("state"), row.get("reason"))
    row["state"] = "degraded"
    return row


def rows_for(results, existing, provider, sources, now_iso):
    """Every cell's row for this conversion: cell -> row, or None to keep the row already recorded."""
    rows = {}
    for cell in CELLS:
        if cell in NOT_RUN:
            row = fixed_row("n/a", NOT_RUN[cell], now_iso)
        else:
            eval_id, tier = EVALS[cell]
            if eval_id in results:
                row = ran_row(cell, tier, results[eval_id], provider(results[eval_id]), sources[eval_id])
            elif cell in existing:
                row = None
            else:
                row = fixed_row("pending", "not run yet; " + waits(cell, tier, eval_id), now_iso, provenance=tier, eval=eval_id)
        skill = cell_skill(cell)
        if row is None:
            if skill in DEGRADED and existing[cell].get("state") != "degraded":
                row = degrade(existing[cell], skill)
        else:
            row = degrade(row, skill)
        rows[cell] = row
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--version", required=True, help="the release, such as 4.2.0")
    ap.add_argument("--input", action="append", required=True, help="stdout of `eve eval --json`; repeatable")
    ap.add_argument("--out", default=os.path.join("docs", "releases"))
    ap.add_argument("--md", default=None, help="the rendered table; default v<version>-smoke.md beside the JSON")
    ap.add_argument("--provider", default=None,
                    help="the sandbox provider; default AB_SANDBOX, else vercel for a --url run and docker for a local one")
    args = ap.parse_args(argv)

    results, sources, targets, eve_version = {}, {}, {}, None
    for path in args.input:
        doc = load_report(path)
        kind = (doc.get("target") or {}).get("kind")
        for result in doc.get("results") or []:
            results[result["id"]] = result
            sources[result["id"]] = path
            targets[result["id"]] = kind
            identity = (result.get("result") or {}).get("runtimeIdentity") or {}
            eve_version = identity.get("eveVersion") or eve_version

    def provider(result):
        if args.provider:
            return args.provider
        if targets.get(result["id"]) == "remote":
            return "vercel"
        return os.environ.get("AB_SANDBOX", "").strip() or "docker"

    json_path = os.path.join(args.out, "v%s-smoke.json" % args.version)
    md_path = args.md or os.path.join(args.out, "v%s-smoke.md" % args.version)
    existing = ((report.load_json(json_path).get("hosts") or {}).get(HOST) or {}).get("cells") or {}
    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = {cell: row for cell, row in rows_for(results, existing, provider, sources, now_iso).items() if row is not None}

    command = shlex.join(["python3", "eve/scripts/smoke-to-json.py"] + (argv if argv is not None else sys.argv[1:]))
    with tempfile.TemporaryDirectory(prefix="ab-eve-smoke-") as scratch:
        jsonl = os.path.join(scratch, "results.jsonl")
        versions = os.path.join(scratch, "versions.tsv")
        with open(jsonl, "w", encoding="utf-8") as fh:
            for cell in CELLS:
                if cell in rows:
                    fh.write(json.dumps(dict(rows[cell], host=HOST, cell=cell)) + "\n")
        with open(versions, "w", encoding="utf-8") as fh:
            fh.write("%s\teve %s\n" % (HOST, eve_version or "unknown"))
        report.smoke(argparse.Namespace(version=args.version, json=json_path, md=md_path, results=jsonl, versions=versions,
                                        command=command, plugin_dir="skills/", hosts=HOST, cells=" ".join(CELLS)))

    # report.py keeps its own fields; the KTD15 measurements go into the same rows as extra keys.
    doc = report.load_json(json_path)
    cells = doc["hosts"][HOST]["cells"]
    for cell, row in rows.items():
        cells[cell].update({k: v for k, v in row.items() if k not in cells[cell]})
    report.mask_doc(doc)
    report.save_json(json_path, doc)
    for cell in CELLS:
        row = cells.get(cell) or {}
        print("%-20s %-10s %s" % (cell, row.get("state", "?"), (row.get("reason") or "")[:100]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
