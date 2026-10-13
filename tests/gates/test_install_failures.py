"""U15: what a failed, unreachable or interrupted route leaves installed, and what it says."""
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import signal
import subprocess
import time
import unittest

try:
    from .gate_helpers import REPO
    from .install_harness import GITHUB, GITHUB_CHECK, INSTALL, PI_SOURCE, PLUGIN, SKILLS, URL, InstallerHarness
except ImportError:
    from gate_helpers import REPO
    from install_harness import GITHUB, GITHUB_CHECK, INSTALL, PI_SOURCE, PLUGIN, SKILLS, URL, InstallerHarness


class InstallerFailures(InstallerHarness):
    def test_failed_route_keeps_the_copies_it_would_replace(self):
        # Every route runs even when an earlier one fails. A tool's own copy leaves only after its
        # route succeeded, and the shared copy stays while a reader's route failed.
        folders = (".agents/skills", ".grok/skills", ".pi/agent/skills")
        for tool, label, failing, kept in (
            ("codex", "Codex", "plugin add " + PLUGIN, (".agents/skills",)),
            ("grok", "Grok Build", "plugin install " + GITHUB + " --trust", (".agents/skills", ".grok/skills")),
            ("pi", "Pi", "install " + PI_SOURCE, (".agents/skills", ".pi/agent/skills")),
        ):
            with self.subTest(failing=tool):
                copies = {folder: self.earlier_copy(folder, "ab-quick-fix") for folder in folders}
                for other in ("codex", "grok", "pi"):
                    self.fake_tool(other, {failing: {"code": 1}} if other == tool else None)
                Path(self.log).write_text("")
                code, out = self.run_install()
                self.assertEqual(code, 1, out)
                for folder, copy in copies.items():
                    self.assertEqual((copy / "ab-quick-fix").is_dir(), folder in kept, folder)
                    self.assertEqual((copy / ".agent-blueprint-install.json").is_file(), folder in kept, folder)
                for command in ("codex plugin add " + PLUGIN, "grok plugin install " + GITHUB + " --trust",
                                "pi install " + PI_SOURCE):
                    self.assertIn(command, self.calls())
                self.assertRegex(out, r"(?m)^  ✗ Failed: [^\n]*\b" + re.escape(label) + r"\b")
                warning = next(line for line in out.splitlines()
                               if line.startswith("  ! ") and str(copies[".agents/skills"]) in line)
                self.assertRegex(warning, r"failed[^\n]*\b" + tool + r"\b")

    def test_failed_route_does_not_stop_later_routes(self):
        copies = [self.earlier_copy(folder, "ab-quick-fix") for folder in
                  (".grok/skills", ".pi/agent/skills")]
        project = Path(self.root, "project")
        self.fake_tool("codex", {"plugin add " + PLUGIN: {"code": 1}})
        for tool in ("grok", "pi"):
            self.fake_tool(tool)
        code, out = self.run_install(str(project))
        self.assertEqual(code, 1, out)
        self.assertIn("grok plugin install " + GITHUB + " --trust", self.calls())
        self.assertIn("pi install " + PI_SOURCE, self.calls())
        # Each split copy leaves with its own tool's route, which ran after Codex failed.
        for copy in copies:
            with self.subTest(copy=copy):
                self.assertEqual(list(copy.iterdir()), [])
        # The project scaffold still runs after a failed route.
        self.assertTrue((project / "AGENTS.md").is_file())
        self.assertRegex(out, r"(?m)^  ✓ Finished: Grok Build, Pi$")
        # Codex removed nothing before plugin add failed, so its install is as it was.
        self.assertRegex(out, r"(?m)^  ✗ Codex did not finish \(exit 1\); its current install and recorded "
                              r"copies stay as they were\.$")
        self.assertRegex(out, r"(?m)^  ✗ Failed: Codex\. Fix the errors above and run install\.sh again\.$")
        self.assertNotIn("Done.", out)

    def test_grok_failed_removal_stops_before_adding_a_duplicate(self):
        self.fake_tool("grok", {"plugin list": "  repo-hash: agent-blueprint [local: /old/checkout]"})
        self.fake_tool("pi")
        code, out = self.run_install()
        self.assertEqual(code, 1, out)
        self.assertIn("Could not confirm Grok removed", out)
        # Grok still lists the install, so nothing was removed.
        self.assertIn("  ✗ Grok Build did not finish (exit 1); its current install and recorded copies stay as "
                      "they were.", out.splitlines())
        # The stop ends only Grok's route; Pi's still runs.
        self.assertEqual(self.mutations(), ["grok plugin uninstall agent-blueprint", "pi install " + PI_SOURCE])

    def test_grok_stall_after_a_removal_says_the_old_install_is_gone(self):
        # Two installs, then one: the first uninstall removed one. The second removes nothing, so the run
        # stops, and the line says an old install was removed.
        self.fake_tool("grok", {"plugin list": ["  a: agent-blueprint [local: /old/a]\n  b: agent-blueprint [local: /old/b]",
                                               "  a: agent-blueprint [local: /old/a]"]})
        code, out = self.run_install()
        self.assertEqual(code, 1, out)
        self.assertEqual(self.mutations(), ["grok plugin uninstall agent-blueprint"] * 2)
        self.assertIn("  ✗ Grok Build did not finish (exit 1) after its old install was removed; run install.sh "
                      "again to install it.", out.splitlines())

    def test_unreachable_github_keeps_the_old_marketplace(self):
        self.unreachable_github()
        self.fake_local_marketplaces()
        self.fake_tool("grok")
        code, out = self.run_install()
        self.assertEqual(code, 1, out)
        # Removing a marketplace uninstalls its plugin, so nothing is removed while GitHub is down.
        self.assertFalse(any("marketplace remove" in c for c in self.calls()))
        self.assertEqual(self.github_checks(), [GITHUB_CHECK] * 3)
        self.assertIn("grok plugin install " + GITHUB + " --trust", self.calls())
        self.assertNotIn("claude plugin install " + PLUGIN, self.calls())
        self.assertNotIn("codex plugin add " + PLUGIN, self.calls())
        for label in ("Claude Code", "Codex", "Cursor CLI"):
            self.assertRegex(out, r"(?m)^  ✗ " + re.escape(label) + r": could not reach " + re.escape(URL) +
                             r", so its current install was left as it was\. ")
            # Nothing was removed, so the route's failure line says the install is as it was.
            self.assertRegex(out, r"(?m)^  ✗ " + re.escape(label) + r" did not finish \(exit 1\); its current "
                                  r"install and recorded copies stay as they were\.$")
        self.assertNotIn("old install was removed", out)
        failed = next(line for line in out.splitlines() if "Failed:" in line)
        for label in ("Claude Code", "Codex", "Cursor CLI"):
            self.assertIn(label, failed)
        self.assertNotIn("Grok", failed)
        self.assertFalse(self.routes().exists())

    def test_missing_git_keeps_the_old_marketplace(self):
        # A PATH with the installer's utilities but no git at all.
        tools = Path(self.root, "no-git")
        tools.mkdir()
        for name in ("bash", "sed", "head", "find", "wc", "tr", "grep", "awk", "dirname", "cat", "mktemp", "rm"):
            found = shutil.which(name, path="/usr/bin:/bin")
            if found:
                os.symlink(found, tools / name)
        os.remove(os.path.join(self.bin, "git"))
        self.fake_tool("claude", {"plugin marketplace list": "❯ agent-blueprint\n  Source: Local (/old/checkout)"})
        code, out = self.run_install("--only", "claude", env_extra={"PATH": self.bin + ":" + str(tools)})
        self.assertEqual(code, 1, out)
        self.assertRegex(out, r"(?m)^  ✗ Claude Code: git is needed[^\n]*" + re.escape(URL) +
                         r"[^\n]*current install")
        self.assertEqual(self.mutations(), [])

    def test_marketplace_swap_checks_github_answers_before_removing(self):
        self.fake_local_marketplaces()
        # Cursor swaps only without the Claude Code plugin, so it runs on its own.
        for only in ("claude,codex", "cursor-agent"):
            with self.subTest(only=only):
                Path(self.log).write_text("")
                code, out = self.run_install("--dry-run", "--only", only)
                self.assertEqual(code, 0, out)
                self.assertEqual(out.count("would run: " + GITHUB_CHECK), len(only.split(",")))
                self.assertFalse(any(c.startswith("git ") for c in self.calls()))
                code, out = self.run_install("--only", only)
                self.assertEqual(code, 0, out)
                calls = self.calls()
                for tool in only.split(","):
                    remove = calls.index(tool + " plugin marketplace remove agent-blueprint")
                    self.assertEqual(calls[remove - 1], GITHUB_CHECK)
                    self.assertIn(tool + " plugin marketplace add " + (URL if tool == "cursor-agent" else GITHUB),
                                  calls[remove + 1:])

    def test_unreachable_github_keeps_pi_and_grok_installs(self):
        # Pi and Grok remove the old install before installing from GitHub, so they check it first.
        self.unreachable_github()
        pinned = PI_SOURCE + "#v4.0.2"
        self.pi_packages(pinned)
        self.fake_tool("pi")
        self.fake_tool("grok", {"plugin list": "  repo-hash: agent-blueprint [local: /old/checkout]"})
        self.fake_tool("hermes")
        code, out = self.run_install()
        self.assertEqual(code, 1, out)
        self.assertEqual(self.mutations(), [])
        self.assertEqual(self.github_checks(), [GITHUB_CHECK] * 2)
        self.assertEqual(self.ab_skills(".hermes", "skills"), SKILLS)
        for label in ("Grok Build", "Pi"):
            self.assertRegex(out, r"(?m)^  ✗ " + re.escape(label) + r": could not reach " + re.escape(URL) +
                             r", so its current install was left as it was\. Check the connection and run "
                             r"install\.sh again\.$")
            self.assertRegex(out, r"(?m)^  ✗ " + re.escape(label) + r" did not finish \(exit 1\); its current "
                                  r"install and recorded copies stay as they were\.$")
        self.assertRegex(out, r"(?m)^  ✗ Failed: Grok Build, Pi\. ")
        self.assertRegex(out, r"(?m)^  ✓ Finished: Hermes$")

    def test_failure_after_a_removal_says_the_old_install_is_gone(self):
        self.fake_tool("claude", {"plugin marketplace list": "❯ agent-blueprint\n  Source: Local (/old/checkout)",
                                  "plugin marketplace add " + GITHUB: {"code": 1}})
        self.fake_tool("grok", {"plugin list": ["  repo-hash: agent-blueprint [local: /old/checkout]",
                                               "No plugins installed"],
                                "plugin install " + GITHUB + " --trust": {"code": 1}})
        # Pi removes the pinned source, then its install from GitHub fails.
        self.pi_packages(PI_SOURCE + "#v4.0.2")
        self.fake_tool("pi", {"install " + PI_SOURCE: {"code": 1}})
        code, out = self.run_install()
        self.assertEqual(code, 1, out)
        self.assertIn("claude plugin marketplace remove agent-blueprint", self.calls())
        self.assertIn("grok plugin uninstall agent-blueprint", self.calls())
        self.assertIn("pi remove " + PI_SOURCE + "#v4.0.2", self.calls())
        for label in ("Claude Code", "Grok Build", "Pi"):
            self.assertRegex(out, r"(?m)^  ✗ " + re.escape(label) + r" did not finish \(exit 1\) after its old "
                                  r"install was removed; run install\.sh again to install it\.$")
        self.assertNotIn("stay as they were", out)
        self.assertRegex(out, r"(?m)^  ✗ Failed: Claude Code, Grok Build, Pi\. Fix the errors above and run "
                              r"install\.sh again\.$")

    def test_failed_removal_says_the_install_stayed(self):
        # The removal itself fails, or Pi's update of the package it keeps does: the install is still there.
        old = Path(self.home, "old checkout")
        old.mkdir()
        (old / "package.json").write_text(json.dumps({"name": "agent-blueprint"}))
        local_marketplace = {"plugin marketplace list": "❯ agent-blueprint\n  Source: Local (/old/checkout)"}
        for tool, label, prepare, expected in (
            ("claude", "Claude Code", lambda: self.fake_tool("claude", {
                **local_marketplace, "plugin marketplace remove agent-blueprint": {"code": 1}}),
             ["claude plugin marketplace remove agent-blueprint"]),
            ("grok", "Grok Build", lambda: self.fake_tool("grok", {
                "plugin list": "  repo-hash: agent-blueprint [local: /old/checkout]",
                "plugin uninstall agent-blueprint": {"code": 1}}),
             ["grok plugin uninstall agent-blueprint"]),
            # Pi keeps the GitHub package and removes an unrelated old checkout before the update fails.
            ("pi", "Pi", lambda: (self.pi_packages(str(old), PI_SOURCE), self.fake_tool("pi", {
                "update --extension " + PI_SOURCE: {"code": 1}})),
             ["pi remove " + str(old), "pi update --extension " + PI_SOURCE]),
        ):
            with self.subTest(tool=tool):
                prepare()
                Path(self.log).write_text("")
                code, out = self.run_install("--only", tool)
                self.assertEqual(code, 1, out)
                self.assertEqual(self.mutations(), expected)
                self.assertIn("  ✗ " + label + " did not finish (exit 1); its current install and recorded copies "
                              "stay as they were.", out.splitlines())
                self.assertNotIn("old install was removed", out)

    def test_cursor_beside_the_claude_plugin_runs_no_cursor_command(self):
        # Cursor's marketplace is shared by every computer on the account, so this route touches nothing.
        self.fake_claude_with_plugin()
        self.record_cursor_route()
        self.fake_tool("cursor-agent", {"plugin marketplace remove agent-blueprint": {"code": 1},
                                        "plugin marketplace list": {"code": 1},
                                        "plugin marketplace update agent-blueprint": {"code": 1}})
        code, out = self.run_install("--only", "cursor-agent")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.cursor_calls(), [])
        self.assertRegex(out, r"(?m)^  ✓ Finished: Cursor CLI$")
        self.assertNotIn("did not finish", out)

    def test_local_swap_skips_the_github_check(self):
        # Under --local the new source is this checkout, so nothing remote is checked before a removal.
        self.unreachable_github()
        self.fake_tool("claude", {"plugin marketplace list": "❯ agent-blueprint\n  Source: GitHub (" + GITHUB + ")"})
        self.fake_tool("grok", {"plugin list": ["  a: agent-blueprint [git: " + URL + "]", "No plugins installed"]})
        self.pi_packages(PI_SOURCE + "#v4.0.2")
        self.fake_tool("pi")
        code, out = self.run_install("--local")
        self.assertEqual(code, 0, out)
        self.assertFalse(any(c.startswith("git ") for c in self.calls()))
        self.assertEqual(self.mutations(), [
            "claude plugin marketplace remove agent-blueprint", "claude plugin marketplace add " + REPO,
            "claude plugin install " + PLUGIN,
            "grok plugin uninstall agent-blueprint", "grok plugin install " + REPO + " --trust",
            "pi remove " + PI_SOURCE + "#v4.0.2", "pi install " + REPO])

    def test_reachability_check_cannot_prompt_or_hang(self):
        # A stub git logs the check's environment; git config is answered by a real git, which reads only
        # the test's HOME (the installer runs outside any repository, and the system file is skipped).
        real_git = shutil.which("git")
        if real_git is None:
            self.skipTest("needs a git to read the test's gitconfig")
        env_log = Path(self.root, "git-env.json")
        git = Path(self.bin, "git")
        git.write_text("#!/usr/bin/env python3\nimport json, os, sys\n"
                       "if sys.argv[1:2] == ['config']:\n    os.execv(%r, ['git'] + sys.argv[1:])\n"
                       "json.dump({k: os.environ.get(k) for k in ('GIT_TERMINAL_PROMPT', 'GIT_SSH_COMMAND')}, "
                       "open(%r, 'w'))\n" % (real_git, str(env_log)))
        self.fake_tool("claude", {"plugin marketplace list": "❯ agent-blueprint\n  Source: Local (/old/checkout)"})
        gitconfig = Path(self.home, ".gitconfig")
        batch = " -o BatchMode=yes -o ConnectTimeout=20"
        for config, env_extra, expected in (
            # A url.insteadOf rewrite to ssh can neither ask for a passphrase nor wait forever...
            ("", {}, "ssh" + batch),
            # ...and uses the ssh command the user set, with the key it names.
            ("[core]\n\tsshCommand = ssh -i ~/.ssh/id_work\n", {}, "ssh -i ~/.ssh/id_work" + batch),
            ('[core]\n\tsshCommand = ssh -i ~/.ssh/id_work\n', {"GIT_SSH_COMMAND": "ssh -F /dev/null"},
             "ssh -F /dev/null" + batch),
            # GIT_SSH names a program that takes no options, so the check leaves it to git.
            ("", {"GIT_SSH": "/usr/local/bin/my-ssh"}, None),
        ):
            with self.subTest(config=config, env=env_extra):
                gitconfig.write_text(config)
                env_log.unlink(missing_ok=True)
                code, out = self.run_install("--only", "claude", env_extra={"GIT_CONFIG_NOSYSTEM": "1", **env_extra})
                self.assertEqual(code, 0, out)
                env = json.loads(env_log.read_text())
                self.assertEqual(env["GIT_TERMINAL_PROMPT"], "0")
                self.assertEqual(env["GIT_SSH_COMMAND"], expected)

    def test_reachability_check_gives_up_after_its_time_limit(self):
        # HTTPS has no connect timeout of its own: a check that outlasts the limit is stopped and counts
        # as unreachable. The limit is 30 s; the test sets it to 1 s.
        stopped = Path(self.root, "git-stopped")
        git = Path(self.bin, "git")
        git.write_text("#!/usr/bin/env python3\nimport pathlib, signal, sys, time\n"
                       "if sys.argv[1:2] == ['config']:\n    sys.exit(1)\n"
                       "signal.signal(signal.SIGTERM, lambda *_: (pathlib.Path(%r).write_text(''), sys.exit(143)))\n"
                       "time.sleep(30)\n" % str(stopped))
        self.fake_tool("claude", {"plugin marketplace list": "❯ agent-blueprint\n  Source: Local (/old/checkout)"})
        started = time.monotonic()
        code, out = self.run_install("--only", "claude", env_extra={"AGENT_BLUEPRINT_TEST_REACH_TIMEOUT": "1"})
        self.assertLess(time.monotonic() - started, 20, out)
        self.assertEqual(code, 1, out)
        self.assertTrue(stopped.exists(), "the check's own git was stopped")
        self.assertRegex(out, r"(?m)^  ✗ Claude Code: could not reach " + re.escape(URL) + r", so its current "
                              r"install was left as it was\. ")
        self.assertEqual(self.mutations(), [])

    def test_interrupted_route_stops_the_run(self):
        # A tool that catches Ctrl-C and exits 130 (or is stopped with 143) ends the whole run.
        for status in (130, 143):
            with self.subTest(status=status):
                self.fake_tool("codex", {"plugin add " + PLUGIN: {"code": status}})
                self.fake_tool("grok")
                Path(self.log).write_text("")
                code, out = self.run_install()
                self.assertEqual(code, status, out)
                self.assertRegex(out, r"(?m)^  ✗ Codex did not finish \(exit %d\)" % status)
                self.assertFalse(any(c.startswith("grok plugin install") for c in self.calls()))
                self.assertNotIn("Failed:", out)

    def interrupt_install(self, waiting):
        """Run install.sh in a process group of its own and send that group SIGINT, as a terminal's Ctrl-C
        does, once the file waiting exists. Returns the exit status and the output."""
        installer = subprocess.Popen(["bash", INSTALL], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                     env=self.install_env(), cwd=self.root, start_new_session=True)
        try:
            deadline = time.monotonic() + 60
            while not waiting.exists() and installer.poll() is None and time.monotonic() < deadline:
                time.sleep(0.05)
            self.assertTrue(waiting.exists(), "the route never reached the step to interrupt")
            os.killpg(installer.pid, signal.SIGINT)
            out, _ = installer.communicate(timeout=60)
        finally:
            if installer.poll() is None:
                os.killpg(installer.pid, signal.SIGKILL)
                installer.wait()
        return installer.returncode, out

    def test_ctrl_c_stops_the_run_whatever_the_tool_exits_with(self):
        # A tool that catches Ctrl-C and exits 1 still stops the run: no later route runs.
        waiting = Path(self.root, "codex-waiting")
        codex = Path(self.bin, "codex")
        codex.write_text("#!/usr/bin/env python3\nimport pathlib, signal, sys, time\n"
                         "if sys.argv[1:3] == ['plugin', 'add']:\n"
                         "    signal.signal(signal.SIGINT, lambda *_: sys.exit(1))\n"
                         "    pathlib.Path(%r).write_text('')\n"
                         "    time.sleep(60)\n" % str(waiting))
        codex.chmod(0o755)
        self.fake_tool("grok")
        code, out = self.interrupt_install(waiting)
        self.assertEqual(code, 130, out)
        self.assertRegex(out, r"(?m)^  ✗ Codex did not finish \(exit 1\); its current install")
        self.assertFalse(any(c.startswith("grok ") for c in self.calls()), out)
        self.assertNotIn("Failed:", out)

    def test_ctrl_c_during_the_reachability_check_stops_it_and_the_run(self):
        # The check's git runs in the background, where Ctrl-C does not reach it: the check stops it.
        waiting, stopped = Path(self.root, "git-waiting"), Path(self.root, "git-stopped")
        git = Path(self.bin, "git")
        git.write_text("#!/usr/bin/env python3\nimport pathlib, signal, sys, time\n"
                       "if sys.argv[1:2] == ['config']:\n    sys.exit(1)\n"
                       "signal.signal(signal.SIGTERM, lambda *_: (pathlib.Path(%r).write_text(''), sys.exit(143)))\n"
                       "pathlib.Path(%r).write_text('')\n"
                       "time.sleep(60)\n" % (str(stopped), str(waiting)))
        self.fake_tool("claude", {"plugin marketplace list": "❯ agent-blueprint\n  Source: Local (/old/checkout)"})
        self.fake_tool("grok")
        code, out = self.interrupt_install(waiting)
        self.assertEqual(code, 130, out)
        self.assertTrue(stopped.exists(), "the check's own git was stopped")
        self.assertRegex(out, r"(?m)^  ✗ Claude Code did not finish \(exit 130\); its current install")
        self.assertEqual(self.mutations(), [])
        self.assertFalse(any(c.startswith("grok ") for c in self.calls()), out)

    def test_host_without_a_route_fails_loudly(self):
        checkout = os.path.join(self.root, "checkout")
        shutil.copytree(REPO, checkout, symlinks=True, ignore=shutil.ignore_patterns(".git", "node_modules", "dist", ".astro"))
        hosts = Path(checkout, "skills/ab-ship-pipeline/scripts/hosts.sh")
        hosts.write_text(hosts.read_text().replace('AB_HOSTS="claude codex agy grok pi cursor-agent hermes amp"',
                                                   'AB_HOSTS="claude codex agy grok pi cursor-agent hermes amp newtool"'))
        for tool in ("grok", "newtool"):
            self.fake_tool(tool)
        code, out = self.run_install(source=os.path.join(checkout, "install.sh"))
        self.assertEqual(code, 1, out)
        self.assertRegex(out, r"(?m)^  ✗ newtool did not finish \(exit 127\)")
        self.assertRegex(out, r"(?m)^  ✗ Failed: newtool\. ")
        self.assertIn("grok plugin install " + GITHUB + " --trust", self.calls())

    def test_copy_dir_on_the_shared_folder_keeps_this_runs_copy(self):
        shared = Path(self.home, ".agents/skills")
        self.earlier_copy(".agents/skills", "ab-quick-fix")
        code, out = self.run_install("--copy-dir", str(shared))
        self.assertEqual(code, 0, out)
        self.assertEqual(self.ab_skills(".agents", "skills"), SKILLS)
        self.assertEqual(sorted(json.loads((shared / ".agent-blueprint-install.json").read_text())["skills"]), SKILLS)
        self.assertIn("Skipped retiring the shared copy in " + str(shared) + ": it is this run's --copy-dir.", out)
        # A failed copy, named through a symlink, keeps its predecessor.
        shutil.rmtree(shared)
        self.earlier_copy(".agents/skills", "ab-quick-fix")
        alias = Path(self.root, "alias")
        alias.symlink_to(shared)
        cp = Path(self.bin, "cp")
        cp.write_text("#!/bin/sh\nexit 1\n")
        cp.chmod(0o755)
        code, out = self.run_install("--copy-dir", str(alias))
        self.assertEqual(code, 1, out)
        self.assertEqual(self.ab_skills(".agents", "skills"), ["ab-quick-fix"])
        self.assertTrue((shared / ".agent-blueprint-install.json").is_file())
        self.assertIn("Skipped retiring the shared copy", out)

    def test_failed_copy_partway_says_to_run_the_installer_again(self):
        # A copy replaces skill folders one at a time, so a cp that fails after two of them leaves old and
        # new skills mixed: the failure line says to run the installer again.
        count = Path(self.root, "cp-count")
        cp = Path(self.bin, "cp")
        cp.write_text('#!/bin/sh\nn=$(cat {0} 2>/dev/null || echo 0)\necho $((n + 1)) > {0}\n[ "$n" -lt 2 ] || exit 1\n'
                      'exec {1} "$@"\n'.format(shlex.quote(str(count)), shlex.quote(shutil.which("cp", path="/bin:/usr/bin"))))
        cp.chmod(0o755)
        for tool, args, folder, label in (
            (None, ["--copy-dir", str(Path(self.home, "custom"))], "custom", "the copy in " + str(Path(self.home, "custom"))),
            ("hermes", ["--only", "hermes"], ".hermes/skills", "Hermes"),
            ("amp", ["--only", "amp"], ".config/amp/skills", "Amp"),
        ):
            with self.subTest(label=label):
                if tool:
                    self.fake_tool(tool)
                copy = self.earlier_copy(folder, *SKILLS)
                count.unlink(missing_ok=True)
                code, out = self.run_install(*args)
                self.assertEqual(code, 1, out)
                self.assertTrue((copy / ".agent-blueprint-install.json").is_file())
                self.assertIn("  ✗ " + label + " did not finish (exit 1) after its old install was removed; run "
                              "install.sh again to install it.", out.splitlines())

    def test_failed_claude_route_keeps_cursor_and_amp_installs(self):
        # Claude Code's refresh fails while its plugin is still listed: Cursor and Amp keep their own.
        self.fake_tool("claude", {"plugin list": PLUGIN + " (enabled)",
                                  "plugin marketplace list": "❯ agent-blueprint\n  Source: GitHub (" + GITHUB + ")",
                                  "plugin marketplace update agent-blueprint": {"code": 1}})
        self.record_cursor_route()
        amp = self.earlier_copy(".config/amp/skills", "ab-quick-fix")
        for tool in ("cursor-agent", "amp"):
            self.fake_tool(tool)
        code, out = self.run_install()
        self.assertEqual(code, 1, out)
        self.assertEqual(self.cursor_calls(), [])
        self.assertIn("cursor-agent", json.loads(self.routes().read_text()))
        self.assertEqual(self.ab_skills(".config", "amp", "skills"), ["ab-quick-fix"])
        self.assertTrue((amp / ".agent-blueprint-install.json").is_file())
        self.assertRegex(out, r"(?m)^  ! Cursor CLI: kept its own install because Claude Code's route failed")
        self.assertEqual(self.cursor_uninstall_notes(out), [])
        self.assertRegex(out, r"(?m)^  ! Amp: kept its own copy in " + re.escape(str(amp)) +
                         r" because Claude Code's route failed")
        self.assertRegex(out, r"(?m)^  ✗ Failed: Claude Code\. ")

    def test_failed_claude_route_keeps_a_cursor_install_found_only_in_its_cache(self):
        # The cache folder alone shows Cursor's own install (a marketplace another computer added).
        self.fake_tool("claude", {"plugin list": PLUGIN + " (enabled)",
                                  "plugin marketplace list": "❯ agent-blueprint\n  Source: GitHub (" + GITHUB + ")",
                                  "plugin marketplace update agent-blueprint": {"code": 1}})
        self.fake_tool("cursor-agent")
        self.cursor_plugin_cache()
        code, out = self.run_install("--only", "claude,cursor-agent")
        self.assertEqual(code, 1, out)
        self.assertEqual(self.cursor_calls(), [])
        self.assertRegex(out, r"(?m)^  ! Cursor CLI: kept its own install because Claude Code's route failed")
        self.assertEqual(self.cursor_uninstall_notes(out), [])
        self.assertFalse(self.routes().exists())

    def test_failed_claude_route_leaves_amp_without_a_copy_on_its_plugin(self):
        # Claude Code's refresh fails while its plugin is still listed, and Amp has no copy of its own to keep.
        self.fake_tool("claude", {"plugin list": PLUGIN + " (enabled)",
                                  "plugin marketplace list": "❯ agent-blueprint\n  Source: GitHub (" + GITHUB + ")",
                                  "plugin marketplace update agent-blueprint": {"code": 1}})
        self.fake_tool("amp")
        code, out = self.run_install()
        self.assertEqual(code, 1, out)
        self.assertIn("  ✓ Amp: covered by the Claude Code plugin", out.splitlines())
        self.assertNotIn("kept its own copy", out)
        self.assertEqual(self.ab_skills(".config", "amp", "skills"), [])

    def test_failed_claude_route_without_its_plugin_gives_cursor_and_amp_their_own(self):
        # The swap removed Claude Code's plugin before its add failed, so Cursor and Amp install their own.
        self.fake_tool("claude", {"plugin list": [PLUGIN, ""],
                                  "plugin marketplace list": "❯ agent-blueprint\n  Source: Local (/old/checkout)",
                                  "plugin marketplace add " + GITHUB: {"code": 1}})
        for tool in ("cursor-agent", "amp"):
            self.fake_tool(tool)
        code, out = self.run_install()
        self.assertEqual(code, 1, out)
        self.assertIn("cursor-agent plugin marketplace add " + URL, self.calls())
        self.assertEqual(self.ab_skills(".config", "amp", "skills"), SKILLS)
        self.assertRegex(out, r"(?m)^  ! Unfinished: Cursor CLI \(/plugin installation required\)$")
        self.assertRegex(out, r"(?m)^  ✓ Finished: Amp$")
        self.assertNotIn("kept its own", out)


if __name__ == "__main__":
    unittest.main()
