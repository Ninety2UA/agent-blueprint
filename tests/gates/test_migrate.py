"""U14: ab-migrate moves a v3 project to v4 without duplicate skills, stray hooks or lost instructions (KTD12, KTD17).

Runs the skill's detect-v3.sh against a copy of the legacy fixture repository.
"""
import os
import shutil
import subprocess
import tempfile
import unittest

from gate_helpers import FIXTURES, REPO, copy_fixture_skill, read, skill_prose

SKILL = os.path.join(REPO, "skills", "ab-migrate")
SCRIPT = os.path.join(SKILL, "scripts", "detect-v3.sh")


def run(*args, cwd):
    env = {k: v for k, v in os.environ.items()}
    env["PATH"] = "/usr/bin:/bin"   # no real `claude` on PATH: the plugin check stays out of the fixture runs
    result = subprocess.run(["bash", SCRIPT] + list(args), cwd=cwd, capture_output=True, text=True, timeout=60, env=env)
    return result.returncode, result.stdout + result.stderr


class LegacyRepo(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        copy_fixture_skill(os.path.join(FIXTURES, "v3-legacy-repo"), self.dir)
        subprocess.run(["git", "init", "-q", self.dir], check=True)

    def tearDown(self):
        shutil.rmtree(self.dir)

    def exists(self, rel):
        return os.path.lexists(os.path.join(self.dir, rel))

    def test_report_lists_the_traces_and_changes_nothing(self):
        code, out = run(cwd=self.dir)
        self.assertEqual(code, 0, out)
        for line in ("remove  .claude/skills/build-pipeline", "remove  .claude/commands/quick-fix.md", "remove  .claude/agents/code-reviewer.md",
                     "remove  .claude/hooks/session-start.js", "remove  scripts/ship.sh", "remove  .claude-plugin/plugin.json",
                     "aside   .claude/ship-loop.local.md", "rename  CLAUDE.md -> AGENTS.md"):
            self.assertIn(line, out)
        self.assertTrue(self.exists(".claude/skills/build-pipeline/SKILL.md"))
        self.assertTrue(self.exists("CLAUDE.md") and not self.exists("AGENTS.md"))

    def test_apply_removes_the_copies_and_leaves_user_files_alone(self):
        code, out = run("--apply", cwd=self.dir)
        self.assertEqual(code, 0, out)
        for gone in (".claude/skills/build-pipeline", ".claude/commands/quick-fix.md", ".claude/agents/code-reviewer.md",
                     ".claude/hooks/session-start.js", "scripts/ship.sh", ".claude-plugin", ".claude/ship-loop.local.md"):
            self.assertFalse(self.exists(gone), gone)
        for kept in (".claude/skills/my-own-skill/SKILL.md", ".claude/commands/deploy.md", ".claude/agents/my-agent.md",
                     ".claude/hooks/my-hook.js", "scripts/deploy.sh", "src/app.py"):
            self.assertTrue(self.exists(kept), kept)
        self.assertTrue(self.exists(".agent-blueprint/run/v3/ship-loop.local.md"))

    def test_claude_md_becomes_agents_md_with_a_pointer(self):
        original = read(os.path.join(self.dir, "CLAUDE.md"))
        run("--apply", cwd=self.dir)
        self.assertEqual(read(os.path.join(self.dir, "AGENTS.md")), original)
        self.assertEqual(read(os.path.join(self.dir, "CLAUDE.md")), "@AGENTS.md\n")

    def test_second_run_changes_nothing(self):
        run("--apply", cwd=self.dir)
        before = sorted(os.path.relpath(os.path.join(r, f), self.dir) for r, _d, fs in os.walk(self.dir) for f in fs if "/.git/" not in r + "/")
        code, out = run("--apply", cwd=self.dir)
        self.assertEqual(code, 3, out)
        self.assertIn("nothing to migrate", out)
        after = sorted(os.path.relpath(os.path.join(r, f), self.dir) for r, _d, fs in os.walk(self.dir) for f in fs if "/.git/" not in r + "/")
        self.assertEqual(before, after)

    def test_existing_agents_md_is_never_replaced(self):
        with open(os.path.join(self.dir, "AGENTS.md"), "w") as fh:
            fh.write("# Ours already\n")
        original = read(os.path.join(self.dir, "CLAUDE.md"))
        code, out = run("--apply", cwd=self.dir)
        self.assertEqual(code, 0, out)
        self.assertNotIn("rename", out)
        self.assertEqual(read(os.path.join(self.dir, "AGENTS.md")), "# Ours already\n")
        self.assertEqual(read(os.path.join(self.dir, "CLAUDE.md")), original)

    def test_symlinked_claude_md_is_left_alone(self):
        os.rename(os.path.join(self.dir, "CLAUDE.md"), os.path.join(self.dir, "INSTRUCTIONS.md"))
        os.symlink("INSTRUCTIONS.md", os.path.join(self.dir, "CLAUDE.md"))
        code, out = run("--apply", cwd=self.dir)
        self.assertEqual(code, 0, out)
        self.assertNotIn("rename", out)
        self.assertTrue(os.path.islink(os.path.join(self.dir, "CLAUDE.md")))
        self.assertFalse(self.exists("AGENTS.md"))

    def test_keep_instructions_skips_the_rename(self):
        original = read(os.path.join(self.dir, "CLAUDE.md"))
        code, out = run("--apply", "--keep-instructions", cwd=self.dir)
        self.assertEqual(code, 0, out)
        self.assertNotIn("rename", out)
        self.assertEqual(read(os.path.join(self.dir, "CLAUDE.md")), original)
        self.assertFalse(self.exists("AGENTS.md"))
        self.assertFalse(self.exists(".claude/skills/build-pipeline"))   # the rest of the migration still ran

    def test_same_named_files_from_another_pack_are_left_alone(self):
        # brainstorming and code-reviewer are names other skill packs ship too; with no sign of a
        # blueprint install the script must not claim them.
        other = tempfile.mkdtemp()
        try:
            for rel in (".claude/skills/brainstorming/SKILL.md", ".claude/agents/code-reviewer.md", ".claude/hooks/session-start.js"):
                path = os.path.join(other, rel)
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w") as fh:
                    fh.write("another pack's file\n")
            with open(os.path.join(other, "AGENTS.md"), "w") as fh:
                fh.write("# Ours\n")
            code, out = run("--apply", cwd=other)
            self.assertEqual(code, 3, out)
            self.assertIn("unsure  .claude/skills/brainstorming", out)
            self.assertNotIn("remove  ", out)
            for rel in (".claude/skills/brainstorming/SKILL.md", ".claude/agents/code-reviewer.md", ".claude/hooks/session-start.js"):
                self.assertTrue(os.path.exists(os.path.join(other, rel)), rel)
        finally:
            shutil.rmtree(other)

    def test_repo_without_traces_reports_nothing(self):
        clean = tempfile.mkdtemp()
        try:
            with open(os.path.join(clean, "AGENTS.md"), "w") as fh:
                fh.write("# Ours\n")
            code, out = run(cwd=clean)
            self.assertEqual(code, 3)
            self.assertIn("nothing to migrate", out)
        finally:
            shutil.rmtree(clean)


class MigrateSkill(unittest.TestCase):
    def test_manual_only_with_codex_policy(self):
        text = read(os.path.join(SKILL, "SKILL.md"))
        self.assertRegex(text, r"(?m)^disable-model-invocation: true$")
        self.assertRegex(read(os.path.join(SKILL, "agents", "openai.yaml")), r"(?m)^policy:\s*\n\s+allow_implicit_invocation:\s*false\s*$")

    def test_headless_run_stops_instead_of_deleting(self):
        text = read(os.path.join(SKILL, "SKILL.md"))
        self.assertIn("**Asking the user.**", text)
        self.assertIn("needs-human", text)
        self.assertIn("Default when nobody answers", text)

    def test_no_other_skill_names_it(self):
        skills = sorted(d for d in os.listdir(os.path.join(REPO, "skills")) if os.path.isfile(os.path.join(REPO, "skills", d, "SKILL.md")))
        self.assertIn("ab-migrate", skills)
        self.assertNotIn("ab-migrate-to-plugin", skills)
        hits = [n for n in skills if n != "ab-migrate" and "ab-migrate" in skill_prose(n)]
        self.assertEqual(hits, [])

    def test_name_map_copy_matches_the_owner(self):
        self.assertEqual(read(os.path.join(SKILL, "references", "v4-skill-names.tsv")),
                         read(os.path.join(REPO, "docs", "upgrade", "v4-skill-names.tsv")))
        rows = dict(line.split("\t")[:2] for line in read(os.path.join(REPO, "docs", "upgrade", "v4-skill-names.tsv")).splitlines()[1:] if line)
        self.assertEqual(rows["migrate-to-plugin"], "ab-migrate")


if __name__ == "__main__":
    unittest.main()
