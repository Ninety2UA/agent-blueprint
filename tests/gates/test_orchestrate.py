"""U7: team work runs everywhere through ab-orchestrate, with native extras (KTD14, KTD17).

Checks the merged skill's ledger, host limits and extras, that the removed skills
leave no trace, and that the Agent Teams hooks act only while the Claude extra runs.
"""
import csv
import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest

from gate_helpers import REPO

SKILL = os.path.join(REPO, "skills", "ab-orchestrate")
REFS = os.path.join(SKILL, "references")
HOSTS = ["claude", "codex", "agy", "grok", "pi", "cursor-agent", "hermes", "amp"]   # KTD15
REMOVED = ["ab-agent-teams", "ab-team-execution"]
# Surfaces outside skills/ that must not name a removed skill (the name map is exempt).
SURFACES = ["AGENTS.md", "README.md", "index.html", "install.sh", ".claude-plugin", "hooks", "scripts",
            "docs/images/promo-video.html"]
MARKER = ".agent-blueprint/team/active.md"


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def section(text, heading):
    """The body of a ## section, up to the next ## heading."""
    m = re.search(r"^## %s\n(.*?)(?=^## |\Z)" % re.escape(heading), text, re.MULTILINE | re.DOTALL)
    return m.group(1) if m else ""


def files_under(rel):
    path = os.path.join(REPO, rel)
    if os.path.isfile(path):
        yield path
        return
    for root, _dirs, names in os.walk(path):
        for name in names:
            yield os.path.join(root, name)


class RemovedSkills(unittest.TestCase):
    def test_removed_skills_are_gone(self):
        for name in REMOVED:
            self.assertFalse(os.path.exists(os.path.join(REPO, "skills", name)), name)

    def test_name_map_points_removed_names_at_orchestrate(self):
        with open(os.path.join(REPO, "docs", "upgrade", "v4-skill-names.tsv"), encoding="utf-8") as fh:
            rows = {r["v3_name"]: r["v4_name"] for r in csv.DictReader(fh, delimiter="\t")}
        self.assertEqual(rows["agent-teams"], "ab-orchestrate")
        self.assertEqual(rows["team-execution"], "ab-orchestrate")

    def test_no_skill_names_a_removed_skill(self):
        pattern = re.compile(r"\b(?:ab-)?(?:agent-teams|team-execution)\b")
        with open(os.path.join(REPO, "scripts", "prompt-owners.json"), encoding="utf-8") as fh:
            name_map_copies = {os.path.join(REPO, c) for e in json.load(fh)["shared"]
                               if e["owner"] == "docs/upgrade/v4-skill-names.tsv" for c in e["copies"]}
        hits = []
        for path in files_under("skills"):
            if path in name_map_copies:   # a skill's own copy of the name map lists every old name (KTD17)
                continue
            for n, line in enumerate(read(path).splitlines(), 1):
                if pattern.search(line):
                    hits.append("%s:%d" % (os.path.relpath(path, REPO), n))
        self.assertEqual(hits, [])

    def test_no_surface_names_a_removed_skill(self):
        pattern = re.compile(r"\b(?:%s)\b" % "|".join(REMOVED))
        hits = []
        for rel in SURFACES:
            for path in files_under(rel):
                try:
                    text = read(path)
                except UnicodeDecodeError:
                    continue
                for n, line in enumerate(text.splitlines(), 1):
                    if pattern.search(line):
                        hits.append("%s:%d" % (os.path.relpath(path, REPO), n))
        self.assertEqual(hits, [])


class HostLimits(unittest.TestCase):
    def setUp(self):
        with open(os.path.join(REFS, "host-limits.tsv"), encoding="utf-8") as fh:
            self.rows = list(csv.DictReader(fh, delimiter="\t"))

    def test_one_row_per_host(self):
        self.assertEqual([r["host"] for r in self.rows], HOSTS)

    def test_values_are_limits_or_undocumented(self):
        for r in self.rows:
            for col in ("interactive", "headless"):
                self.assertRegex(r[col], r"^(?:[1-9][0-9]*|-)$", "%s %s" % (r["host"], col))
            self.assertIn(r["isolation"], ("worktree", "ownership"), r["host"])
            self.assertTrue(r["note"].strip(), r["host"])

    def test_hermes_one_shot_allows_two(self):
        hermes = next(r for r in self.rows if r["host"] == "hermes")
        self.assertEqual(hermes["headless"], "2")


class Ledger(unittest.TestCase):
    def setUp(self):
        self.text = read(os.path.join(REFS, "team-ledger.md"))

    def example(self):
        block = re.search(r"```markdown\n(.*?)```", self.text, re.DOTALL).group(1)
        size = int(re.search(r"Helpers per wave: (\d+)", block).group(1))
        tasks = []
        for line in section(block, "Tasks").splitlines():
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) == 7 and re.match(r"T\d+$", cells[0]):
                tasks.append({"id": cells[0], "needs": cells[2], "files": set(f.strip() for f in cells[3].split(",")),
                              "wave": int(cells[4]), "status": cells[5]})
        return size, tasks

    def test_rules_are_stated(self):
        for rule in ("The lead session is the only writer of the ledger",
                     "Two tasks that touch the same file therefore never share a wave",
                     "a helper limit of 2 splits four ready tasks into two waves of two",
                     "An unlisted host gets 2",
                     "runs in a wave of its own",
                     "The lead alone integrates, commits and runs the authoritative tests",
                     "Never delete the ledger"):
            self.assertIn(rule, self.text)
        self.assertIn("references/host-limits.tsv", self.text)
        for iso in ("**worktree:**", "**ownership:**", "**inline:**"):
            self.assertIn(iso, self.text)

    def test_example_obeys_its_own_rules(self):
        size, tasks = self.example()
        self.assertGreaterEqual(len(tasks), 3)
        by_id = {t["id"]: t for t in tasks}
        waves = {}
        for t in tasks:
            self.assertIn(t["status"], ("pending", "running", "done", "blocked", "needs-input", "failed"))
            waves.setdefault(t["wave"], []).append(t)
            for dep in filter(None, (d.strip() for d in t["needs"].replace("-", "").split(","))):
                self.assertLess(by_id[dep]["wave"], t["wave"], "%s runs before its dependency %s" % (t["id"], dep))
        for n, members in waves.items():
            self.assertLessEqual(len(members), size, "wave %d exceeds the helper limit" % n)
            for i, a in enumerate(members):
                for b in members[i + 1:]:
                    self.assertFalse(a["files"] & b["files"], "%s and %s share a file in wave %d" % (a["id"], b["id"], n))
        self.assertTrue(any(a["files"] & b["files"] for a in tasks for b in tasks if a is not b),
                        "the example should show two tasks that share a file landing in different waves")

    def test_example_carries_notes_and_decisions(self):
        block = re.search(r"```markdown\n(.*?)```", self.text, re.DOTALL).group(1)
        self.assertRegex(section(block, "Notes"), r"- \[wave \d+, T\d+\] ")
        self.assertRegex(section(block, "Decisions"), r"- \[wave \d+, T\d+\] ")


class Coordinator(unittest.TestCase):
    def setUp(self):
        self.text = read(os.path.join(REFS, "coordinator.md"))

    def test_one_flow_with_no_team_mode(self):
        self.assertNotRegex(self.text, r"(?i)team mode|execution mode")
        for ref in ("references/team-ledger.md", "references/native-extras.md", "references/host-limits.tsv"):
            self.assertIn(ref, self.text)

    def test_helper_output_carries_notes_for_the_ledger(self):
        # The contract's own fenced output section holds ## headings, so cut at the next top-level section.
        contract = self.text.split("## Helper Return Contract", 1)[1].split("## Forwarding User Content", 1)[0]
        self.assertIn("## Notes", contract)
        self.assertIn("append to the ledger", contract)

    def test_cleanup_deletes_nothing(self):
        self.assertNotRegex(self.text, r"\brm -")
        self.assertIn("Delete nothing", section(self.text, "Phase 6: Close the Ledger"))

    def test_skill_names_the_ledger_and_the_extras(self):
        skill = read(os.path.join(SKILL, "SKILL.md"))
        for ref in ("references/coordinator.md", "references/team-ledger.md", "references/native-extras.md",
                    "references/host-limits.tsv"):
            self.assertIn(ref, skill)
        self.assertIn("--wave-size N", skill)


class NativeExtras(unittest.TestCase):
    def setUp(self):
        self.text = read(os.path.join(REFS, "native-extras.md"))

    def test_sections(self):
        self.assertEqual(re.findall(r"^## (.+)$", self.text, re.MULTILINE),
                         ["Claude Code Agent Teams", "Codex multi_agent_v2", "Adding another host"])

    def test_claude_extra_needs_the_flag_an_interactive_session_and_the_tools(self):
        body = section(self.text, "Claude Code Agent Teams")
        applies = body.split("**What changes:**")[0]
        for condition in ("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "interactive", "claude -p", "SendMessage"):
            self.assertIn(condition, applies)
        self.assertIn("`active: true`", body)
        self.assertIn("`active: false`", body)
        self.assertIn(MARKER, body)

    def test_codex_extra_needs_its_messaging_tools(self):
        applies = section(self.text, "Codex multi_agent_v2").split("**What changes:**")[0]
        for tool in ("send_message", "followup_task", "list_agents", "interrupt_agent", "multi_agent_v2 = true"):
            self.assertIn(tool, applies)

    def test_each_extra_keeps_the_ledger(self):
        for heading in ("Claude Code Agent Teams", "Codex multi_agent_v2"):
            self.assertIn("ledger", section(self.text, heading), heading)


@unittest.skipUnless(shutil.which("node") and shutil.which("git"), "node and git are needed to run the hooks")
class AgentTeamsHooks(unittest.TestCase):
    """The two Claude extra hooks act only while the marker says active: true."""

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        subprocess.run(["git", "init", "-q", self.dir], check=True)
        for key, value in (("user.email", "t@example.com"), ("user.name", "t")):
            subprocess.run(["git", "-C", self.dir, "config", key, value], check=True)
        with open(os.path.join(self.dir, "app.py"), "w") as fh:
            fh.write("x = 1\n")
        subprocess.run(["git", "-C", self.dir, "add", "app.py"], check=True)
        subprocess.run(["git", "-C", self.dir, "commit", "-qm", "init"], check=True)
        with open(os.path.join(self.dir, "app.py"), "w") as fh:
            fh.write("x = 1\nbreakpoint()\n")

    def tearDown(self):
        shutil.rmtree(self.dir)

    def marker(self, content):
        os.makedirs(os.path.join(self.dir, ".agent-blueprint", "team"), exist_ok=True)
        with open(os.path.join(self.dir, MARKER), "w") as fh:
            fh.write(content)

    def hook(self, name):
        return subprocess.run(["node", os.path.join(REPO, "hooks", "handlers", name)], cwd=self.dir,
                              capture_output=True, text=True, timeout=60)

    def test_no_marker_means_no_action(self):
        self.assertEqual(self.hook("task-completed.js").returncode, 0)

    def test_inactive_marker_means_no_action(self):
        self.marker("active: false\n")
        self.assertEqual(self.hook("task-completed.js").returncode, 0)

    def test_active_marker_blocks_a_leftover_breakpoint(self):
        self.marker("active: true\n")
        result = self.hook("task-completed.js")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn("breakpoint", result.stderr)

    def test_idle_teammate_may_leave_changes_for_the_lead_to_commit(self):
        self.marker("active: true\n")
        result = self.hook("teammate-idle.js")
        self.assertEqual(result.returncode, 0, result.stderr)


class ShipRoutesToOrchestrate(unittest.TestCase):
    def test_stage_four_runs_orchestrate_in_every_mode(self):
        text = read(os.path.join(REPO, "skills", "ab-ship-pipeline", "SKILL.md"))
        stage = re.search(r"### Stage 4: Execute\n(.*?)(?=^### )", text, re.MULTILINE | re.DOTALL).group(1)
        self.assertIn("Invoke the ab-orchestrate skill", stage)
        self.assertIn("in both modes", stage)
        self.assertEqual(set(re.findall(r"\bab-[a-z0-9-]+", stage)), {"ab-orchestrate"})


if __name__ == "__main__":
    unittest.main()
