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

    def run_install(self, *args, source=INSTALL, env_extra=None):
        env = {"HOME": self.home, "PATH": self.bin + ":/usr/bin:/bin", "TERM": "dumb"}
        env.update(env_extra or {})
        result = subprocess.run(["bash", source] + list(args), capture_output=True, text=True, env=env, timeout=300)
        return result.returncode, result.stdout + result.stderr

    def fake_claude_with_plugin(self):
        """A Claude Code stand-in whose `plugin list` reports the blueprint as installed."""
        path = os.path.join(self.bin, "claude")
        with open(path, "w") as fh:
            fh.write('#!/bin/sh\necho "claude $*" >> "%s"\n'
                     'case "$*" in "plugin list"*) echo "agent-blueprint@agent-blueprint (enabled)" ;; esac\n' % self.log)
        os.chmod(path, os.stat(path).st_mode | stat.S_IXUSR)

    def earlier_shared_copy(self, *names, source="/old/checkout"):
        """A shared copy and install record as an earlier install.sh run wrote them."""
        copy = os.path.join(self.home, ".agents", "skills")
        for name in names:
            os.makedirs(os.path.join(copy, name))
        lines = ['{', '  "plugin": "agent-blueprint",', '  "version": "4.0.0",', '  "source": "%s",' % source, '  "skills": [']
        lines += ['    "%s"%s' % (n, "," if i < len(names) - 1 else "") for i, n in enumerate(names)] + ['  ]', '}']
        with open(os.path.join(copy, ".agent-blueprint-install.json"), "w") as fh:
            fh.write("\n".join(lines) + "\n")
        return copy

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
        for tool in ("claude", "agy", "codex", "grok"):
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
        self.assertIn("grok: covered by the copy", out)
        self.assertNotIn("agy: covered by the copy", out)   # Antigravity is never covered by the shared copy

    def ab_skills(self, *parts):
        path = os.path.join(self.home, *parts)
        return sorted(d for d in os.listdir(path) if d.startswith("ab-")) if os.path.isdir(path) else []

    def test_cursor_or_amp_beside_claude_code_sees_each_skill_once(self):
        # Cursor CLI and Amp read Claude Code's plugin as well as ~/.agents/skills, so with the
        # plugin installed a shared copy would list every skill twice there: each other host gets
        # its own route instead.
        for tool in ("claude", "codex", "grok", "pi", "hermes", "cursor-agent", "amp"):
            self.fake_tool(tool)
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        calls = self.calls()
        self.assertEqual(self.ab_skills(".agents", "skills"), [])
        self.assertIn("codex plugin marketplace add %s" % REPO, calls)
        self.assertIn("codex plugin add agent-blueprint@agent-blueprint", calls)
        self.assertEqual(self.ab_skills(".grok", "skills"), SKILLS)
        self.assertEqual(self.ab_skills(".pi", "agent", "skills"), SKILLS)
        self.assertEqual(self.ab_skills(".hermes", "skills"), SKILLS)
        self.assertIn("Cursor CLI: covered by the Claude Code plugin", out)
        self.assertIn("Amp: covered by the Claude Code plugin", out)
        self.assertNotIn("lists every skill twice", out)

    def test_a_shared_copy_left_by_an_earlier_install_goes_when_cursor_sits_beside_claude_code(self):
        copy = self.earlier_shared_copy("ab-quick-fix")
        os.makedirs(os.path.join(copy, "my-own-skill"))
        for tool in ("claude", "cursor-agent"):
            self.fake_tool(tool)
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertFalse(os.path.exists(os.path.join(copy, "ab-quick-fix")))
        self.assertFalse(os.path.exists(os.path.join(copy, ".agent-blueprint-install.json")))
        self.assertTrue(os.path.isdir(os.path.join(copy, "my-own-skill")))   # never the user's own skills
        self.assertIn("Removed the earlier shared copy", out)

    def test_only_cursor_beside_an_installed_claude_plugin_gets_no_shared_copy(self):
        # The route follows the machine, not the --only list: README's per-tool command must not
        # bring the duplicates back.
        self.fake_claude_with_plugin()
        self.fake_tool("cursor-agent")
        code, out = self.run_install("--only", "cursor-agent")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.ab_skills(".agents", "skills"), [])
        self.assertIn("Cursor CLI: covered by the Claude Code plugin", out)

    def test_a_filtered_run_keeps_the_shared_copy_another_host_still_reads(self):
        copy = self.earlier_shared_copy("ab-quick-fix")
        for tool in ("claude", "cursor-agent", "codex"):
            self.fake_tool(tool)
        code, out = self.run_install("--only", "claude,cursor-agent")
        self.assertEqual(code, 0, out)
        self.assertTrue(os.path.isdir(os.path.join(copy, "ab-quick-fix")))   # Codex still reads it
        self.assertIn("Kept the shared copy", out)
        self.assertIn("codex", out.split("Kept the shared copy", 1)[1].splitlines()[0])

    def test_a_folder_the_installer_did_not_put_in_a_host_folder_is_kept(self):
        mine = os.path.join(self.home, ".pi", "agent", "skills", "ab-quick-fix")
        os.makedirs(mine)
        with open(os.path.join(mine, "SKILL.md"), "w") as fh:
            fh.write("my own edited copy\n")
        for tool in ("claude", "cursor-agent", "pi"):
            self.fake_tool(tool)
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertEqual(read(os.path.join(mine, "SKILL.md")), "my own edited copy\n")
        self.assertIn("ab-brainstorming", self.ab_skills(".pi", "agent", "skills"))
        self.assertIn("Kept", out)
        self.assertIn("ab-quick-fix", out)

    def test_the_copy_dir_variable_keeps_one_shared_copy(self):
        custom = os.path.join(self.root, "custom-skills")
        for tool in ("claude", "cursor-agent", "grok"):
            self.fake_tool(tool)
        code, out = self.run_install(env_extra={"AGENT_BLUEPRINT_COPY_DIR": custom})
        self.assertEqual(code, 0, out)
        self.assertEqual(sorted(d for d in os.listdir(custom) if d.startswith("ab-")), SKILLS)
        self.assertEqual(self.ab_skills(".grok", "skills"), [])

    def test_cleanup_reads_skill_names_only_from_the_record_list(self):
        # install.sh writes the checkout path into the record unescaped, quotes and all.
        copy = self.earlier_shared_copy("ab-quick-fix", source='/work/"ab-mine"/checkout')
        os.makedirs(os.path.join(copy, "ab-mine"))
        for tool in ("claude", "cursor-agent"):
            self.fake_tool(tool)
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertFalse(os.path.exists(os.path.join(copy, "ab-quick-fix")))
        self.assertTrue(os.path.isdir(os.path.join(copy, "ab-mine")))   # named only in the source path

    def test_a_dry_run_in_split_mode_removes_nothing_and_says_so(self):
        copy = self.earlier_shared_copy("ab-quick-fix")
        for tool in ("claude", "cursor-agent"):
            self.fake_tool(tool)
        code, out = self.run_install("--dry-run")
        self.assertEqual(code, 0, out)
        self.assertTrue(os.path.isdir(os.path.join(copy, "ab-quick-fix")))
        self.assertIn("Would remove the earlier shared copy", out)

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
