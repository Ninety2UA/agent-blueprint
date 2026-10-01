"""U11: install.sh is a thin multi-host helper (KTD16, KTD18).

Runs the installer against a scratch HOME and PATH: with no tools, with fake
tool binaries that record their arguments, with --copy-dir, and after a skill
rename. Nothing here touches the real home directory.
"""
import json
import os
import shutil
import stat
import subprocess
import tempfile
import unittest

from gate_helpers import REPO, read

INSTALL = os.path.join(REPO, "install.sh")
SKILLS = sorted(d for d in os.listdir(os.path.join(REPO, "skills")) if os.path.isfile(os.path.join(REPO, "skills", d, "SKILL.md")))


class Installer(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.home = os.path.join(self.root, "home")
        self.bin = os.path.join(self.root, "bin")
        os.makedirs(self.home)
        os.makedirs(self.bin)
        self.log = os.path.join(self.root, "calls.log")

    def tearDown(self):
        shutil.rmtree(self.root)

    def fake_tool(self, name):
        """A stand-in binary that appends its arguments to the call log and prints nothing."""
        path = os.path.join(self.bin, name)
        with open(path, "w") as fh:
            fh.write('#!/bin/sh\necho "%s $*" >> "%s"\n' % (name, self.log))
        os.chmod(path, os.stat(path).st_mode | stat.S_IXUSR)

    def run_install(self, *args, source=INSTALL):
        env = {"HOME": self.home, "PATH": self.bin + ":/usr/bin:/bin", "TERM": "dumb"}
        result = subprocess.run(["bash", source] + list(args), capture_output=True, text=True, env=env, timeout=300)
        return result.returncode, result.stdout + result.stderr

    def calls(self):
        return read(self.log).splitlines() if os.path.exists(self.log) else []

    def test_no_tool_says_so_and_stops(self):
        code, out = self.run_install("--dry-run")
        self.assertNotEqual(code, 0)
        for host in ("claude", "codex", "agy", "grok", "pi", "cursor-agent", "hermes", "amp"):
            self.assertIn("%s: not installed" % host, out)
        self.assertIn("--copy-dir", out)

    def test_legacy_is_retired(self):
        code, out = self.run_install("--legacy", "/tmp/never")
        self.assertEqual(code, 2)
        self.assertIn("ab-migrate", out)

    def test_native_routes_and_one_shared_copy(self):
        for tool in ("claude", "agy", "codex", "cursor-agent", "amp"):
            self.fake_tool(tool)
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        calls = self.calls()
        self.assertIn("claude plugin marketplace add %s" % REPO, calls)
        self.assertIn("claude plugin install agent-blueprint@agent-blueprint", calls)
        self.assertIn("agy plugin install %s" % REPO, calls)
        copy = os.path.join(self.home, ".agents", "skills")
        self.assertEqual(sorted(d for d in os.listdir(copy) if d.startswith("ab-")), SKILLS)
        self.assertIn("codex: covered by the copy", out)
        self.assertIn("cursor-agent: covered by the copy", out)
        self.assertIn("Amp: covered by the Claude Code install", out)
        self.assertNotIn("agy: covered by the copy", out)   # Antigravity is never covered by the shared copy

    def test_amp_alone_gets_the_copy(self):
        self.fake_tool("amp")
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertIn("amp: covered by the copy", out)
        self.assertTrue(os.path.isdir(os.path.join(self.home, ".agents", "skills", "ab-quick-fix")))

    def test_dry_run_names_the_commands_and_writes_nothing(self):
        for tool in ("claude", "codex"):
            self.fake_tool(tool)
        code, out = self.run_install("--dry-run")
        self.assertEqual(code, 0, out)
        self.assertIn("would run: claude plugin marketplace add", out)
        self.assertIn("would run: claude plugin install agent-blueprint@agent-blueprint", out)
        self.assertFalse(os.path.exists(os.path.join(self.home, ".agents")))
        self.assertEqual([c for c in self.calls() if "install" in c], [])

    def test_rerun_removes_a_renamed_skill_and_keeps_user_skills(self):
        copy = os.path.join(self.root, "copy")
        code, out = self.run_install("--copy-dir", copy)
        self.assertEqual(code, 0, out)
        record = json.loads(read(os.path.join(copy, ".agent-blueprint-install.json")))
        self.assertEqual(sorted(record["skills"]), SKILLS)
        os.makedirs(os.path.join(copy, "my-own-skill"))
        with open(os.path.join(copy, "my-own-skill", "SKILL.md"), "w") as fh:
            fh.write("---\nname: my-own-skill\ndescription: mine\n---\n")
        # A second checkout where one skill was renamed.
        checkout = os.path.join(self.root, "checkout")
        shutil.copytree(REPO, checkout, symlinks=True, ignore=shutil.ignore_patterns(".git", "node_modules"))
        os.rename(os.path.join(checkout, "skills", "ab-quick-fix"), os.path.join(checkout, "skills", "ab-quick-change"))
        code, out = self.run_install("--copy-dir", copy, source=os.path.join(checkout, "install.sh"))
        self.assertEqual(code, 0, out)
        self.assertFalse(os.path.exists(os.path.join(copy, "ab-quick-fix")))
        self.assertTrue(os.path.isdir(os.path.join(copy, "ab-quick-change")))
        self.assertTrue(os.path.isdir(os.path.join(copy, "my-own-skill")))
        self.assertIn("Removed ab-quick-fix", out)

    def test_only_limits_the_hosts_and_rejects_unknown_names(self):
        for tool in ("claude", "codex"):
            self.fake_tool(tool)
        code, out = self.run_install("--only", "claude")
        self.assertEqual(code, 0, out)
        self.assertIn("claude plugin install agent-blueprint@agent-blueprint", self.calls())
        self.assertFalse(os.path.exists(os.path.join(self.home, ".agents", "skills")), "codex was not asked for")
        code, out = self.run_install("--only", "claude,emacs")
        self.assertEqual(code, 2)
        self.assertIn("Unknown host in --only: emacs", out)

    def test_copy_dir_inside_the_checkout_skills_is_refused(self):
        checkout = os.path.join(self.root, "checkout")
        shutil.copytree(REPO, checkout, symlinks=True, ignore=shutil.ignore_patterns(".git", "node_modules"))
        installer = os.path.join(checkout, "install.sh")
        link = os.path.join(self.root, "alias")
        os.symlink(os.path.join(checkout, "skills"), link)
        for target in (os.path.join(checkout, "skills"), link):
            code, out = self.run_install("--copy-dir", target, source=installer)
            self.assertEqual(code, 2, out)
            self.assertIn("own skills folder", out)
            self.assertEqual(sorted(d for d in os.listdir(os.path.join(checkout, "skills")) if d.startswith("ab-")), SKILLS)
            self.assertTrue(os.path.isfile(os.path.join(checkout, "skills", "ab-quick-fix", "SKILL.md")))

    def test_scaffold_only(self):
        project = os.path.join(self.root, "project")
        code, out = self.run_install("--scaffold", project)
        self.assertEqual(code, 0, out)
        self.assertTrue(os.path.isfile(os.path.join(project, "AGENTS.md")))
        self.assertEqual(read(os.path.join(project, "CLAUDE.md")), "@AGENTS.md\n")

    def test_never_writes_claude_registry_files(self):
        self.fake_tool("claude")
        self.run_install()
        self.assertFalse(os.path.exists(os.path.join(self.home, ".claude", "plugins")))


if __name__ == "__main__":
    unittest.main()
