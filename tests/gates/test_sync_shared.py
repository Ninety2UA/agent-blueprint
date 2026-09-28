"""U4: scripts/sync-shared.py keeps snippet and shared-file copies equal to their owners (KTD3).

Also checks that the authoring guide passes the gate itself and that it documents
exactly the rules the gate enforces.
"""
import importlib.util
import json
import os
import re
import unittest

from gate_helpers import REPO, SCRIPTS, Repo, run_gate

OWNER = "skills/ab-writing-skills/references/capability-snippets.md"
SKILL = "skills/ab-fixture/SKILL.md"
GUIDE = os.path.join(REPO, "skills", "ab-writing-skills", "references", "portable-authoring.md")


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(SCRIPTS, filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SYNC = load("sync_shared", "sync-shared.py")
GATE = load("check_portability", "check-portability.py")


def real_snippets():
    snips, _, _ = SYNC.snippets(REPO, SYNC.load_registry(REPO))
    return snips


class RealOwner(unittest.TestCase):
    def test_owner_holds_the_five_snippets(self):
        self.assertEqual(sorted(real_snippets()), sorted([
            "**Asking the user.**", "**Bundled scripts.**", "**Helper step.**",
            "**Lower effort.**", "**Tracking tasks.**"]))

    def test_every_snippet_is_one_line_paragraph(self):
        for label, text in real_snippets().items():
            self.assertNotIn("\n", text, label)

    def test_repository_copies_match(self):
        code, out = run_gate("sync-shared.py", REPO, "--check")
        self.assertEqual(code, 0, out)

    def test_authoring_guide_passes_every_rule(self):
        found, _ = GATE.collect(REPO)
        mine = sorted(k for k in found if k[0].startswith("skills/ab-writing-skills/"))
        self.assertEqual(mine, [], "ab-writing-skills violations: %s" % mine)

    def test_writing_skills_left_the_allowlist(self):
        with open(os.path.join(SCRIPTS, "portability-allowlist.json"), encoding="utf-8") as fh:
            allow = json.load(fh)
        self.assertEqual([p for p in allow["skills"] if p.startswith("skills/ab-writing-skills/")], [])

    def test_guide_rules_match_the_gate_rules(self):
        documented = set(re.findall(r"^  ([a-z][a-z-]+) ", GATE.__doc__, re.MULTILINE))
        with open(GUIDE, encoding="utf-8") as fh:
            in_guide = set(re.findall(r"\[([a-z][a-z-]+)\]", fh.read()))
        self.assertTrue(documented, "no rule ids parsed from check-portability.py")
        self.assertEqual(in_guide, documented)


class SyncTool(unittest.TestCase):
    def setUp(self):
        self.repo = Repo()
        with open(os.path.join(REPO, OWNER), encoding="utf-8") as fh:
            self.repo.write(OWNER.replace("ab-writing-skills", "ab-helper"), fh.read())
        self.repo.registry({"snippet_owner": OWNER.replace("ab-writing-skills", "ab-helper"), "shared": []})
        self.snips = real_snippets()
        self.helper = self.snips["**Helper step.**"]

    def tearDown(self):
        self.repo.cleanup()

    def paste(self, text, site="Prompt: `references/guide.md`. Inputs: the target."):
        self.repo.edit(SKILL, "2. Use the", "\n%s\n\n%s\n\n2. Use the" % (text, site))

    def test_one_byte_difference_fails_the_gate(self):
        self.paste(self.helper[:-1] + "!")
        code, out = run_gate("check-portability.py", self.repo.root)
        self.assertEqual(code, 1, out)
        self.assertIn("%s: [snippet-drift]" % SKILL, out)

    def test_exact_copy_passes(self):
        self.paste(self.helper)
        code, out = run_gate("check-portability.py", self.repo.root)
        self.assertEqual(code, 0, out)

    def test_sync_rewrites_drift_and_keeps_the_site_line(self):
        site = "Prompt: `references/guide.md`. Inputs: the target."
        self.paste(self.helper.replace("if you can", "whenever possible"), site)
        code, out = run_gate("sync-shared.py", self.repo.root, "--check")
        self.assertEqual(code, 1, out)
        code, out = run_gate("sync-shared.py", self.repo.root)
        self.assertEqual(code, 0, out)
        self.assertIn("synced %s" % SKILL, out)
        text = self.repo.read(SKILL)
        self.assertIn("\n%s\n\n%s\n" % (self.helper, site), text)
        code, out = run_gate("sync-shared.py", self.repo.root)
        self.assertEqual(code, 0, out)
        self.assertIn("0 file(s) rewritten", out)
        code, out = run_gate("sync-shared.py", self.repo.root, "--check")
        self.assertEqual(code, 0, out)

    def test_sync_keeps_list_indentation(self):
        drifted = "   " + self.snips["**Tracking tasks.**"].replace("verified", "checked")
        self.repo.edit(SKILL, "2. Use the", "2. Track it.\n\n%s\n\n3. Use the" % drifted)
        run_gate("sync-shared.py", self.repo.root)
        self.assertIn("\n   %s\n" % self.snips["**Tracking tasks.**"], self.repo.read(SKILL))

    def test_run_in_snippet_needs_a_hand_fix(self):
        self.repo.edit(SKILL, "2. Use the", "Some text first.\n%s\n\n2. Use the" % self.helper)
        code, out = run_gate("sync-shared.py", self.repo.root)
        self.assertEqual(code, 1, out)
        self.assertIn("fix it by hand", out)

    def test_owner_file_itself_is_not_a_copy(self):
        code, out = run_gate("sync-shared.py", self.repo.root, "--check")
        self.assertEqual(code, 0, out)

    def test_sync_restores_a_shared_file_copy(self):
        owner = "skills/ab-helper/references/agents/reviewer.md"
        copy = "skills/ab-fixture/references/agents/reviewer.md"
        self.repo.write(owner, "# Reviewer\n\n## Output\n\nFindings.\n")
        self.repo.registry({"snippet_owner": OWNER.replace("ab-writing-skills", "ab-helper"),
                            "shared": [{"owner": owner, "copies": [copy]}]})
        code, out = run_gate("sync-shared.py", self.repo.root, "--check")
        self.assertEqual(code, 1, out)
        self.assertIn("copy is missing", out)
        run_gate("sync-shared.py", self.repo.root)
        self.assertEqual(self.repo.read(copy), self.repo.read(owner))

    def test_owner_in_a_missing_skill_fails(self):
        self.repo.registry({"shared": [{"owner": "skills/ab-gone/references/agents/x.md", "copies": []}]})
        code, out = run_gate("sync-shared.py", self.repo.root)
        self.assertEqual(code, 1, out)
        code, out = run_gate("check-portability.py", self.repo.root)
        self.assertEqual(code, 1, out)
        self.assertIn("skills/ab-gone/references/agents/x.md: [owner-missing]", out)


if __name__ == "__main__":
    unittest.main()
