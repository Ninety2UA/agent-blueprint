"""U5: agents live inside the skills that dispatch them, as prompt files (KTD2).

Checks the real tree: no agents/ directory, prompt files without frontmatter that
open with a role header and end with an Output section, no prompt that starts
helpers of its own, and every prompt a skill names present in that skill. A file
named <prompt>-<topic>.md beside <prompt>.md is a companion the prompt loads at a
point of use; it is a plain note, not a prompt.
"""
import glob
import os
import re
import shutil
import subprocess
import tempfile
import unittest

from gate_helpers import REPO, gate_module, read

AGENT_FILES = sorted(glob.glob(os.path.join(REPO, "skills", "*", "references", "agents", "*.md")))


def is_companion(path):
    """<prompt>-<topic>.md beside <prompt>.md: notes a prompt loads at a point of use, not a prompt itself."""
    folder, name = os.path.split(path)
    stem = name[:-3]
    return any(os.path.isfile(os.path.join(folder, stem[:i] + ".md")) for i, ch in enumerate(stem) if ch == "-")


PROMPTS = [p for p in AGENT_FILES if not is_companion(p)]
COMPANIONS = [p for p in AGENT_FILES if is_companion(p)]
# Imperative helper-starting wording, and one host's team or dispatch tools.
STARTS_HELPERS = re.compile(
    r"\b(?:dispatch|spawn|launch|start)\s+(?:a|an|another|the|parallel|one|two|\d+|multiple|several)?\s*"
    r"(?:helper|subagent|sub-agent|agent|worker|teammate)s?\b"
    r"|\b(?:Task|Agent) tool\b|\bTeamCreate\b|\bSendMessage\b|\bspawn_agent\b", re.IGNORECASE)
PROMPT_REF = re.compile(r"references/agents/([a-z0-9-]+)\.md")
FENCE = gate_module().FENCE   # the gate's own fence pattern, so the two cannot drift apart


class PromptFiles(unittest.TestCase):
    def test_agents_directory_is_gone(self):
        self.assertFalse(os.path.exists(os.path.join(REPO, "agents")))

    def test_there_are_prompt_files(self):
        self.assertGreaterEqual(len({os.path.basename(p) for p in PROMPTS}), 28)

    def test_no_prompt_has_frontmatter(self):
        bad = [os.path.relpath(p, REPO) for p in PROMPTS if read(p).startswith("---")]
        self.assertEqual(bad, [])

    def test_every_prompt_opens_with_a_role_header(self):
        bad = []
        for p in PROMPTS:
            lines = [l for l in read(p).splitlines() if l.strip()]
            if len(lines) < 2 or not lines[0].startswith("# ") or not lines[1].startswith("**Role.**"):
                bad.append(os.path.relpath(p, REPO))
        self.assertEqual(bad, [], "prompt files must open with '# Title' then a **Role.** line")

    def test_every_role_header_states_scope_effort_and_no_helpers(self):
        bad = []
        for p in PROMPTS:
            role = next(l for l in read(p).splitlines() if l.startswith("**Role.**"))
            if not (("Read-only" in role or "May write" in role)
                    and ("Safe at lower effort" in role or "session's effort" in role)
                    and "Start no helpers of your own" in role):
                bad.append(os.path.relpath(p, REPO))
        self.assertEqual(bad, [])

    def test_every_prompt_ends_with_the_output_section(self):
        bad = []
        for p in PROMPTS:
            text = FENCE.sub("", read(p))
            headings = re.findall(r"^## (.+)$", text, re.MULTILINE)
            if not headings or headings[-1].strip() != "Output":
                bad.append(os.path.relpath(p, REPO))
        self.assertEqual(bad, [], "the last ## heading of every prompt file must be '## Output'")

    def test_no_prompt_starts_helpers_of_its_own(self):
        hits = []
        for p in PROMPTS:
            for n, line in enumerate(read(p).splitlines(), 1):
                if "Start no helpers of your own" in line:
                    continue
                m = STARTS_HELPERS.search(line)
                if m:
                    hits.append("%s:%d: %s" % (os.path.relpath(p, REPO), n, m.group(0)))
        self.assertEqual(hits, [], "only the main session dispatches (KTD2):\n" + "\n".join(hits))

    def test_companions_are_plain_notes_their_prompt_names(self):
        bad = []
        for p in COMPANIONS:
            folder, name = os.path.split(p)
            stem = name[:-3]
            prompt = next(os.path.join(folder, stem[:i] + ".md") for i, ch in enumerate(stem) if ch == "-"
                          and os.path.isfile(os.path.join(folder, stem[:i] + ".md")))
            text = read(p)
            if text.startswith("---") or not text.startswith("# ") or name not in read(prompt):
                bad.append(os.path.relpath(p, REPO))
        self.assertEqual(bad, [], "a companion has no frontmatter, opens with '# Title' and is named in its prompt")

    def test_no_prompt_carries_example_tags(self):
        """Empty <example> blocks were a v3 template leftover in 22 prompts; a prompt shows examples in prose."""
        bad = [os.path.relpath(p, REPO) for p in AGENT_FILES if "<example" in read(p)]
        self.assertEqual(bad, [])

    def test_no_team_lead_prompt(self):
        self.assertEqual([p for p in PROMPTS if os.path.basename(p) == "team-lead.md"], [])

    def test_every_named_prompt_exists_in_its_own_skill(self):
        missing = []
        for skill in sorted(glob.glob(os.path.join(REPO, "skills", "*"))):
            for path in glob.glob(os.path.join(skill, "**", "*.md"), recursive=True):
                if "/assets/" in path:
                    continue
                for name in set(PROMPT_REF.findall(FENCE.sub("", read(path)))):   # examples in fences are not dispatch sites
                    if not os.path.isfile(os.path.join(skill, "references", "agents", name + ".md")):
                        missing.append("%s names references/agents/%s.md" % (os.path.relpath(path, REPO), name))
        self.assertEqual(missing, [])

    def test_starts_helpers_pattern_catches_an_instruction(self):
        self.assertTrue(STARTS_HELPERS.search("Then dispatch a subagent for each file."))
        self.assertTrue(STARTS_HELPERS.search("Use the Task tool to fan out."))
        self.assertFalse(STARTS_HELPERS.search("Start no helpers of your own."))
        self.assertFalse(STARTS_HELPERS.search("When the dispatching step names an output contract"))


class DriftGateAgentCount(unittest.TestCase):
    """The drift gate fails a current-state surface that still counts agents (v4 has helper prompts)."""

    def run_drift_with(self, rel_path, extra):
        root = tempfile.mkdtemp()
        try:
            copy = os.path.join(root, "repo")
            shutil.copytree(REPO, copy, symlinks=True, ignore=shutil.ignore_patterns(".git", "node_modules"))
            with open(os.path.join(copy, rel_path), "a", encoding="utf-8") as fh:
                fh.write(extra)
            result = subprocess.run(["bash", os.path.join(copy, "scripts", "check-drift.sh"), copy],
                                    capture_output=True, text=True, timeout=120)
            return result.returncode, result.stdout + result.stderr
        finally:
            shutil.rmtree(root)

    def test_agent_count_in_the_instructions_fails(self):
        code, out = self.run_drift_with("AGENTS.md", "\nThe plugin ships 29 specialized subagents.\n")
        self.assertNotEqual(code, 0, out)
        self.assertIn("still claims an agent count", out)

    def test_agent_count_in_the_readme_tree_fails(self):
        code, out = self.run_drift_with("README.md", "\n```\n\u2514\u2500\u2500 29 agents\n```\n")
        self.assertNotEqual(code, 0, out)
        self.assertIn("still lists an agent count", out)


if __name__ == "__main__":
    unittest.main()
