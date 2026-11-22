#!/usr/bin/env python3
"""transcript-stats.py -- what one Claude Code run did, read from its session transcript.

Usage: python3 tests/smoke/transcript-stats.py LOG [--config-dir DIR] [--cwd DIR]

LOG is an eval or smoke log holding the run's `claude -p --output-format json` result. The script
finds the session id in it, reads the session's transcript and its helpers' transcripts under
<config dir>/projects/, and prints one line of key=value pairs:

  main_tokens     input, cache and output tokens of the main session
  helper_tokens   the same over every helper (subagent) transcript of the session
  helpers         how many helpers the session started
  helper_share    helper_tokens / (main_tokens + helper_tokens), 0 to 1
  test_runs       shell commands that ran a test suite (pytest, unittest, npm or node test, go test, cargo test)
  reruns          test runs with no file edit since the previous test run (a repeat of a check already made)
  hedges          hedge words in the final message ("should", "probably", "likely", "seems", "appears", "might")

A run the timeout killed leaves no result; with --cwd (the run's working folder) the script then reads
the newest session transcript Claude Code kept for that folder. Each assistant message is counted once (a streamed message repeats its usage on every content block).
Prints "transcript=missing" when the log has no session id or the transcript is gone. Read-only.
"""
import glob
import json
import os
import re
import sys

TEST_RE = re.compile(r"\b(pytest|unittest|npm (run )?test|node --test|go test|cargo test|make test|python3? -m pytest)\b")
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
HEDGE_RE = re.compile(r"\b(should|probably|likely|seems?|appears?|might)\b", re.I)


def session_result(log):
    """The last JSON result object in the log that names a session id."""
    found = None
    try:
        text = open(log, encoding="utf-8", errors="replace").read()
    except OSError:
        return None
    for line in text.splitlines():
        line = line.strip()
        if not (line.startswith("{") and '"session_id"' in line):
            continue
        try:
            doc = json.loads(line)
        except ValueError:
            continue
        if isinstance(doc, dict) and doc.get("session_id"):
            found = doc
    return found


def usage_total(usage):
    if not isinstance(usage, dict):
        return 0
    return sum(int(usage.get(k) or 0) for k in
               ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))


def read_transcript(path):
    """(tokens, events) for one transcript; events are ("test", cmd) and ("edit", tool) in order."""
    tokens, seen, events = 0, set(), []
    try:
        fh = open(path, encoding="utf-8", errors="replace")
    except OSError:
        return 0, []
    with fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            msg = rec.get("message") if isinstance(rec, dict) else None
            if not isinstance(msg, dict) or msg.get("role") != "assistant":
                continue
            mid = msg.get("id") or rec.get("uuid")
            if mid not in seen:
                seen.add(mid)
                tokens += usage_total(msg.get("usage"))
            for block in msg.get("content") or []:
                if not isinstance(block, dict) or block.get("type") != "tool_use":
                    continue
                name, inp = block.get("name"), block.get("input") or {}
                if name in EDIT_TOOLS:
                    events.append(("edit", name))
                elif name == "Bash" and TEST_RE.search(str(inp.get("command", ""))):
                    events.append(("test", inp.get("command", "")))
    return tokens, events


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__.strip().splitlines()[2])
        return 2
    log = args[0]
    cfg = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude")
    if "--config-dir" in args:
        cfg = args[args.index("--config-dir") + 1]
    result = session_result(log) or {}
    mains = []
    if result.get("session_id"):
        mains = glob.glob(os.path.join(cfg, "projects", "*", result["session_id"] + ".jsonl"))
    if not mains and "--cwd" in args:
        # Claude Code names a project folder after the real path with every other character a dash.
        slug = re.sub(r"[^A-Za-z0-9]", "-", os.path.realpath(args[args.index("--cwd") + 1]))
        mains = sorted(glob.glob(os.path.join(cfg, "projects", slug, "*.jsonl")), key=os.path.getmtime)[-1:]
    if not mains:
        print("transcript=missing")
        return 0
    sid = os.path.basename(mains[0])[:-len(".jsonl")]
    main_tokens, events = read_transcript(mains[0])
    helper_files = glob.glob(os.path.join(os.path.dirname(mains[0]), sid, "subagents", "*.jsonl"))
    helper_tokens = 0
    for f in helper_files:
        t, ev = read_transcript(f)
        helper_tokens += t
        events.extend(ev)  # helper edits and tests count too; order within a helper is kept
    test_runs = reruns = 0
    edited_since_test = True
    for kind, _ in events:
        if kind == "edit":
            edited_since_test = True
        else:
            test_runs += 1
            if not edited_since_test:
                reruns += 1
            edited_since_test = False
    total = main_tokens + helper_tokens
    share = helper_tokens / total if total else 0.0
    hedges = len(HEDGE_RE.findall(str(result.get("result") or "")))
    print("main_tokens=%d helper_tokens=%d helpers=%d helper_share=%.3f test_runs=%d reruns=%d hedges=%d" % (
        main_tokens, helper_tokens, len(helper_files), share, test_runs, reruns, hedges))
    return 0


if __name__ == "__main__":
    sys.exit(main())
