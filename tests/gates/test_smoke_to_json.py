"""eve/scripts/smoke-to-json.py writes the Eve rows of the smoke record from `eve eval --json` output.

Runs the converter on a recorded-shape report (eve's log lines, then the JSON) in a temporary
release folder, and checks what KTD15 and R19 ask: all fourteen cells labelled with a state the
legend knows, the seven cells Eve does not run as n/a with a reason, the measurements report.py
has no field for as extra keys, a merge that keeps earlier rows, the rendered table and the host
note's smoke section, and a degraded skill's cell rendered `degraded`.
"""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

from gate_helpers import REPO

CONVERTER = os.path.join(REPO, "eve", "scripts", "smoke-to-json.py")
SMOKE = os.path.join(REPO, "tests", "smoke")
sys.path.insert(0, SMOKE)
import report  # noqa: E402

STATES = [state for state, _ in report.STATES]
T0 = "2026-10-29T03:01:45.000Z"


def converter():
    spec = importlib.util.spec_from_file_location("smoke_to_json", CONVERTER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fact(kind, data, at=T0):
    return {"type": kind, "data": data, "meta": {"at": at}}


def usage(owner, inp, read, write, out):
    return fact("usage.recorded", {"kind": "model", "owner": owner,
                                   "usage": {"inputTokens": inp, "cacheReadTokens": read, "cacheWriteTokens": write, "outputTokens": out}})


def result(eval_id, verdict, events=(), total=None, assertions=(), skip=None, tool_calls=(), subagents=0):
    res = {"sessionId": "wrun_%s" % eval_id.upper(), "sessions": [{"primary": True, "events": list(events)}],
           "runtimeIdentity": {"eveVersion": "0.86.0"},
           "derived": {"toolCalls": list(tool_calls), "subagentCallCount": subagents}}
    if total:
        res["derived"]["usage"] = total
    entry = {"id": eval_id, "verdict": verdict, "startedAt": T0, "completedAt": "2026-10-29T03:02:10.400Z",
             "assertions": list(assertions), "result": res}
    if skip:
        entry["skipReason"] = skip
    return entry


# discovery: two Anthropic calls, a compaction summary, a delegated agent's spend the eval did not
# capture, one sandbox call of 2.5 seconds, one subagent and one helper call.
DISCOVERY = result(
    "discovery", "passed",
    events=[
        fact("model.started", {"runId": "run_0", "modelId": "anthropic/claude-test"}), fact("model.requested", {"runId": "run_0"}),
        usage({"runId": "run_0"}, 1000, 0, 800, 50),
        fact("call.requested", {"callId": "c1", "capability": {"kind": "tool", "name": "bash"}}),
        fact("call.started", {"callId": "c1"}, "2026-10-29T03:01:50.000Z"),
        fact("call.settled", {"callId": "c1", "outcome": "completed"}, "2026-10-29T03:01:52.500Z"),
        fact("call.requested", {"callId": "c2", "capability": {"kind": "tool", "name": "web_fetch"}}),
        fact("call.started", {"callId": "c2"}, "2026-10-29T03:01:53.000Z"),
        fact("call.settled", {"callId": "c2", "outcome": "completed"}, "2026-10-29T03:01:59.000Z"),
        fact("model.started", {"runId": "run_1", "modelId": "anthropic/claude-test"}), fact("model.requested", {"runId": "run_1"}),
        usage({"runId": "run_1"}, 1200, 800, 100, 20),
        fact("context.started", {"changeId": "change_0", "kind": "compaction", "cause": {}}),
        usage({"changeId": "change_0"}, 300, 0, 0, 40),
        fact("context.settled", {"changeId": "change_0", "kind": "compaction", "outcome": "completed"}),
        usage({"callId": "c9"}, 500, 0, 0, 10),
    ],
    total={"inputTokens": 3000, "cacheReadTokens": 800, "cacheWriteTokens": 900, "outputTokens": 120, "costUsd": 0.42},
    assertions=[{"name": "calledSkill(ab-brainstorming)", "severity": "gate", "passed": True}] * 6,
    tool_calls=[{"name": "helper"}, {"name": "bash"}], subagents=1,
)
HOOKS = result("hooks", "failed", assertions=[
    {"name": "calledTool(write_file)", "severity": "gate", "passed": True},
    {"name": "calledTool(bash)", "severity": "gate", "passed": False, "message": "found 0"},
])
CANARY_SKIPPED = result("canary", "skipped", skip="live cell: the scripted mock follows its script, not the skill; "
                                                  "waits for Gateway credits: npx eve eval canary")
CANARY_PASSED = result("canary", "passed", events=[fact("model.started", {"runId": "run_0", "modelId": "anthropic/claude-test"}),
                                                   fact("model.requested", {"runId": "run_0"}), usage({"runId": "run_0"}, 900, 0, 0, 9)],
                       total={"inputTokens": 900, "cacheReadTokens": 0, "cacheWriteTokens": 0, "outputTokens": 9},
                       assertions=[{"name": "canary check", "severity": "gate", "passed": True}])


def eve_stdout(*results, kind="local"):
    doc = {"target": {"kind": kind, "url": "http://127.0.0.1:1/"}, "results": list(results), "passed": 0, "failed": 0}
    return "eve: initializing 1 sandbox template...\neve: starting sandbox command: ls {x}\n" + json.dumps(doc, indent=2) + "\n"


class SmokeToJson(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="ab-smoke-to-json-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.out = os.path.join(self.tmp, "releases")

    def convert(self, *results, kind="local", name="eval.json", extra=()):
        path = os.path.join(self.tmp, name)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(eve_stdout(*results, kind=kind))
        env = {k: v for k, v in os.environ.items() if k != "AB_SANDBOX"}
        run = subprocess.run([sys.executable, CONVERTER, "--version", "9.9.9", "--input", path, "--out", self.out, *extra],
                             cwd=REPO, env=env, capture_output=True, text=True, timeout=60)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        with open(os.path.join(self.out, "v9.9.9-smoke.json"), encoding="utf-8") as fh:
            return json.load(fh)

    def test_every_cell_is_labelled(self):
        doc = self.convert(DISCOVERY, HOOKS, CANARY_SKIPPED)
        cells = doc["hosts"]["eve"]["cells"]
        self.assertEqual(sorted(cells), sorted(converter().CELLS))
        self.assertEqual(len(cells), 14)
        for cell, row in cells.items():
            self.assertIn(row["state"], STATES, cell)
            self.assertTrue(row["reason"], cell)
        not_run = sorted(c for c, row in cells.items() if row["state"] == "n/a")
        self.assertEqual(not_run, sorted(["helpers-off", "effort", "debug", "tdd-override", "brainstorm-override", "team", "upgrade"]))
        self.assertEqual(doc["hosts"]["eve"]["version"], "eve 0.86.0")

    def test_a_mock_pass_carries_its_measurements(self):
        row = self.convert(DISCOVERY)["hosts"]["eve"]["cells"]["discovery"]
        self.assertEqual(row["state"], "pass")
        self.assertEqual(row["provenance"], "mock")
        self.assertTrue(row["reason"].startswith("mock run (scripted model, no tokens spent, docker sandbox): 6 of 6 gates"), row["reason"])
        self.assertEqual(row["seconds"], 25)
        self.assertEqual(row["date"], "2026-10-29T03:02:10Z")
        self.assertEqual(row["tokens"], 3120)
        self.assertEqual(row["cost_usd"], 0.42)
        self.assertEqual(row["tokens_by_model"]["anthropic/claude-test"],
                         {"input": 500, "cache_read": 800, "cache_write": 900, "output": 70})
        self.assertEqual(row["tokens_by_model"]["compaction"], {"input": 300, "cache_read": 0, "cache_write": 0, "output": 40})
        self.assertEqual(row["tokens_by_model"]["unattributed"], {"input": 500, "cache_read": 0, "cache_write": 0, "output": 10})
        self.assertEqual(row["model_calls"], 2)
        self.assertEqual(row["subagent_calls"], 2)
        self.assertEqual(row["compactions"], [{"history_tokens": 1200, "outcome": "completed"}])
        self.assertEqual(row["provider"], "docker")
        self.assertEqual(row["sandbox_seconds"], 2.5)
        self.assertEqual(row["session"], "wrun_DISCOVERY")

    def test_failed_skipped_and_missing_cells(self):
        cells = self.convert(DISCOVERY, HOOKS, CANARY_SKIPPED)["hosts"]["eve"]["cells"]
        self.assertEqual(cells["hooks"]["state"], "fail")
        self.assertIn("calledTool(bash): found 0", cells["hooks"]["reason"])
        self.assertEqual(cells["canary"]["state"], "pending")
        self.assertIn("waits for Gateway credits", cells["canary"]["reason"])
        for cell in ("build", "review"):
            self.assertEqual(cells[cell]["state"], "pending")
            self.assertIn("npx eve eval %s" % cell, cells[cell]["reason"])
            self.assertEqual(cells[cell]["provenance"], "live")
        self.assertIn("--url", cells["ship"]["reason"])
        self.assertIn("--tag mock", cells["manual-only"]["reason"])

    def test_a_later_run_merges_and_keeps_earlier_rows(self):
        self.convert(DISCOVERY, HOOKS, CANARY_SKIPPED)
        doc = self.convert(CANARY_PASSED, name="live.json", kind="remote")
        cells = doc["hosts"]["eve"]["cells"]
        self.assertEqual(cells["canary"]["state"], "pass")
        self.assertEqual(cells["canary"]["provenance"], "live")
        self.assertEqual(cells["canary"]["provider"], "vercel")
        self.assertEqual(cells["discovery"]["state"], "pass")
        self.assertIn("tokens_by_model", cells["discovery"])
        self.assertEqual(cells["hooks"]["state"], "fail")
        self.assertEqual(len(doc["runs"]), 2)

    def test_the_table_and_the_host_note_render(self):
        doc = self.convert(DISCOVERY, HOOKS, CANARY_SKIPPED)
        with open(os.path.join(self.out, "v9.9.9-smoke.md"), encoding="utf-8") as fh:
            md = fh.read()
        self.assertRegex(md, r"\n\| eve \| pass \d+s \| pending \| fail")
        self.assertIn("- `pending`: ", md)
        self.assertIn("- `degraded`: ", md)

        hosts = os.path.join(self.tmp, "hosts")
        os.makedirs(hosts)
        notes = converter()._host_notes().NOTES
        for note in notes.values():
            with open(os.path.join(hosts, note), "w", encoding="utf-8") as fh:
                fh.write("# Note\n\n## Smoke status\n\nold\n")
        json_path = os.path.join(self.out, "v9.9.9-smoke.json")
        script = os.path.join(SMOKE, "host-notes.py")
        run = subprocess.run([sys.executable, script, "--json", json_path, "--hosts", hosts],
                             cwd=self.tmp, capture_output=True, text=True, timeout=60)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        with open(os.path.join(hosts, "eve.md"), encoding="utf-8") as fh:
            section = fh.read().split("## Smoke status\n", 1)[1]
        rows = [line for line in section.splitlines() if line.startswith("| `")]
        self.assertEqual(len(rows), 14)
        self.assertIn("| `hooks` | fail |", section)
        self.assertNotIn("old", section)

        os.remove(os.path.join(hosts, "eve.md"))
        run = subprocess.run([sys.executable, script, "--json", json_path, "--hosts", hosts],
                             cwd=self.tmp, capture_output=True, text=True, timeout=60)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        self.assertIn("eve          skipped: ", run.stdout)
        self.assertFalse(os.path.exists(os.path.join(hosts, "eve.md")))

    def test_a_degraded_skill_cell_renders_degraded(self):
        module = converter()
        self.assertIn("degraded", STATES)
        own = module.cell_skill
        module.cell_skill = lambda cell: "ab-health-check" if cell == "build" else own(cell)
        rows = module.rows_for({"build": CANARY_PASSED | {"id": "build"}}, {}, lambda _: "docker", {"build": "live.json"},
                               "2026-10-29T00:00:00Z")
        self.assertEqual(rows["build"]["state"], "degraded")
        self.assertIn("ab-health-check is degraded on Eve", rows["build"]["reason"])
        self.assertIn("(the eval: pass,", rows["build"]["reason"])
        self.assertNotIn("untested", json.dumps(rows))
        # A cell that did not run is degraded too, never left unlabelled.
        rows = module.rows_for({}, {}, lambda _: "docker", {}, "2026-10-29T00:00:00Z")
        self.assertEqual(rows["build"]["state"], "degraded")


if __name__ == "__main__":
    unittest.main()
