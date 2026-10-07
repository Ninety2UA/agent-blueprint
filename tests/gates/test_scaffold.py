"""U10: AGENTS.md is canonical, and ab-project-start merges into existing instruction files (KTD9).

Runs the skill's own scaffold script against temporary projects: an empty one,
one with a CLAUDE.md of its own, one with an AGENTS.md of its own, and a rerun.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

from gate_helpers import REPO, read, write

SKILL = os.path.join(REPO, "skills", "ab-project-start")
ASSETS = os.path.join(SKILL, "assets")
SCRIPT = os.path.join(SKILL, "scripts", "scaffold.py")
CAP = 200   # R15: instruction files that load every session stay short


class Templates(unittest.TestCase):
    def test_template_claude_md_is_exactly_the_import(self):
        self.assertEqual(read(os.path.join(ASSETS, "CLAUDE.md")), "@AGENTS.md\n")

    def test_both_agents_files_are_short_and_clean(self):
        for path in (os.path.join(REPO, "AGENTS.md"), os.path.join(ASSETS, "AGENTS.md")):
            text = read(path)
            self.assertLessEqual(len(text.splitlines()), CAP, path)
            self.assertNotIn("<!--", text, path)

    def test_root_claude_md_is_a_symlink_to_agents_md(self):
        path = os.path.join(REPO, "CLAUDE.md")
        self.assertTrue(os.path.islink(path))
        self.assertEqual(os.readlink(path), "AGENTS.md")

    def test_templates_folder_is_gone(self):
        self.assertFalse(os.path.exists(os.path.join(REPO, "templates")))

    def test_assets_hold_no_dotfiles(self):
        # Package managers and glob copies drop dotfiles, so they are stored without the dot.
        dotted = [os.path.relpath(os.path.join(r, n), ASSETS) for r, ds, fs in os.walk(ASSETS)
                  for n in fs + ds if n.startswith(".")]
        self.assertEqual(dotted, [])


class Scaffold(unittest.TestCase):
    def setUp(self):
        self.project = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.project)

    def run_scaffold(self, *extra):
        result = subprocess.run([sys.executable, SCRIPT, self.project] + list(extra), capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return {line.split()[1]: line.split()[0] for line in result.stdout.splitlines() if not line.startswith("scaffold:")}

    def p(self, rel):
        return os.path.join(self.project, rel)

    def test_empty_project_gets_both_files_and_the_docs(self):
        actions = self.run_scaffold()
        self.assertEqual(read(self.p("AGENTS.md")), read(os.path.join(ASSETS, "AGENTS.md")))
        self.assertEqual(read(self.p("CLAUDE.md")), "@AGENTS.md\n")
        for rel in ("docs/context/STATUS.md", "docs/context/CONVENTIONS.md", "BACKLOG.md", ".gitignore",
                    ".agent-blueprint/.gitignore", "src/.gitkeep"):
            self.assertTrue(os.path.isfile(self.p(rel)), rel)
            self.assertEqual(actions[rel], "created", rel)

    def test_existing_claude_md_gains_the_import_and_keeps_its_content(self):
        write(self.project, "CLAUDE.md", "# My rules\n\nUse tabs.\n")
        actions = self.run_scaffold()
        self.assertEqual(actions["CLAUDE.md"], "merged")
        text = read(self.p("CLAUDE.md"))
        self.assertEqual(text.splitlines()[0], "@AGENTS.md")
        self.assertIn("# My rules\n\nUse tabs.\n", text)
        self.assertTrue(os.path.isfile(self.p("AGENTS.md")))

    def test_existing_agents_md_keeps_its_sections_and_gains_missing_ones(self):
        own = "# Ours\n\n## Commits\n\nWe squash everything.\n\n## Deploys\n\nFridays never.\n"
        write(self.project, "AGENTS.md", own)
        actions = self.run_scaffold()
        self.assertEqual(actions["AGENTS.md"], "merged")
        text = read(self.p("AGENTS.md"))
        self.assertTrue(text.startswith(own.rstrip()))
        self.assertEqual(text.count("## Commits"), 1, "a section the project already has is not added twice")
        self.assertIn("We squash everything.", text)
        self.assertIn("## Deploys", text)
        self.assertIn("## How to work", text)

    def test_rerun_changes_nothing(self):
        self.run_scaffold()
        before = {r: read(os.path.join(self.project, r)) for r in ("AGENTS.md", "CLAUDE.md", ".gitignore")}
        actions = self.run_scaffold()
        self.assertEqual(set(actions.values()), {"kept"})
        for rel, text in before.items():
            self.assertEqual(read(self.p(rel)), text, rel)

    def test_claude_md_symlinked_to_agents_md_is_left_alone(self):
        write(self.project, "AGENTS.md", "# Ours\n")
        os.symlink("AGENTS.md", self.p("CLAUDE.md"))
        actions = self.run_scaffold()
        self.assertEqual(actions["CLAUDE.md"], "kept")
        self.assertTrue(os.path.islink(self.p("CLAUDE.md")))
        self.assertNotIn("@AGENTS.md", read(self.p("AGENTS.md")))

    def test_claude_md_hard_linked_to_agents_md_is_left_alone(self):
        write(self.project, "AGENTS.md", "# Ours\n")
        os.link(self.p("AGENTS.md"), self.p("CLAUDE.md"))
        actions = self.run_scaffold()
        self.assertEqual(actions["CLAUDE.md"], "kept")
        self.assertNotIn("@AGENTS.md", read(self.p("AGENTS.md")))

    def test_gitignore_gains_missing_lines_only(self):
        write(self.project, ".gitignore", "dist/\n.env\n")
        actions = self.run_scaffold()
        self.assertEqual(actions[".gitignore"], "merged")
        lines = read(self.p(".gitignore")).splitlines()
        self.assertEqual(lines[:2], ["dist/", ".env"])
        self.assertEqual(lines.count(".env"), 1)

    def test_existing_project_gets_no_placeholder_folders(self):
        write(self.project, "package.json", "{}\n")
        self.run_scaffold()
        self.assertFalse(os.path.exists(self.p("src")))

    def test_dry_run_writes_nothing(self):
        target = os.path.join(self.project, "new")
        subprocess.run([sys.executable, SCRIPT, target, "--dry-run"], capture_output=True, check=True)
        self.assertFalse(os.path.exists(target))


class SkillUsesItsAssets(unittest.TestCase):
    def test_skill_runs_the_script_from_its_own_folder(self):
        text = read(os.path.join(SKILL, "SKILL.md"))
        self.assertIn("scripts/scaffold.py", text)
        self.assertIn("**Bundled scripts.**", text)
        self.assertNotIn("templates/", text)


if __name__ == "__main__":
    unittest.main()
