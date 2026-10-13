"""Shared harness for the installer tests: isolated homes, stub tools and their call log.

test_install.py, test_install_failures.py and test_pi_source.py import it. Its name keeps
unittest discovery from collecting it, and InstallerHarness has no tests of its own.
"""
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

try:
    from .gate_helpers import REPO
except ImportError:
    from gate_helpers import REPO

INSTALL = os.path.join(REPO, "install.sh")
SKILLS = sorted(d for d in os.listdir(os.path.join(REPO, "skills")) if os.path.isfile(os.path.join(REPO, "skills", d, "SKILL.md")))
GITHUB = "Ninety2UA/agent-blueprint"
URL = "https://github.com/" + GITHUB
PI_SOURCE = "git:github.com/" + GITHUB
PLUGIN = "agent-blueprint@agent-blueprint"
# The check install.sh runs before it removes a marketplace from another source.
GITHUB_CHECK = "git ls-remote --exit-code " + URL + " HEAD"
# Pi git sources in the forms Pi 0.73.1 reads (dist/utils/git.js). pi_source.py parses them for both
# install.sh and hosts.sh; a ref, written @ref, #ref or GitHub's /tree/<ref>, pins the package.
PI_PLAIN_FORMS = ("git:https://github.com/{}", "git:http://github.com/{}", "git:ssh://git@github.com/{}",
                  "git:git@github.com:{}", "git:github.com/{}.git", "git:https://github.com/{}.git",
                  "git:git://github.com/{}", "https://github.com/{}", "ssh://git@github.com/{}",
                  "git://github.com/{}", "git:www.github.com/{}", "git:github.com:{}")
PI_PINNED_FORMS = ("git:github.com/{}@v4.0.2", "git:github.com/{}#v4.0.2", "git:git@github.com:{}@v4.0.2",
                   "git:ssh://git@github.com/{}@v4.0.2", "https://github.com/{}@v4.0.2",
                   "git:https://github.com/{}/tree/v4.0.2")
PI_GIT_FORMS = PI_PLAIN_FORMS + PI_PINNED_FORMS
PI_PARSER = os.path.join(REPO, "skills/ab-ship-pipeline/scripts/pi_source.py")


class InstallerHarness(unittest.TestCase):
    """setUp gives each test an isolated HOME and PATH of stub tools that log their calls."""

    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.home = os.path.join(self.root, "home")
        self.bin = os.path.join(self.root, "bin")
        os.makedirs(self.home)
        os.makedirs(self.bin)
        self.log = os.path.join(self.root, "calls.jsonl")
        self.fixtures = Path(self.root, "fixtures.json")
        self.fixtures.write_text("{}")
        # Use the test interpreter even in a deliberately restricted PATH.
        os.symlink(sys.executable, os.path.join(self.bin, "python3"))
        # PATH reaches /usr/bin, so a real git would check GitHub over the network before a swap.
        self.fake_tool("git")

    def tearDown(self):
        shutil.rmtree(self.root)

    def fake_tool(self, name, responses=None):
        """Real-shaped listing fixtures; a list of responses advances on each read."""
        fixtures = json.loads(self.fixtures.read_text())
        fixtures[name] = responses or {}
        self.fixtures.write_text(json.dumps(fixtures))
        path = Path(self.bin, name)
        path.write_text("#!/usr/bin/env python3\n" +
            "import json, pathlib, sys\n" +
            "name = pathlib.Path(sys.argv[0]).name\n" +
            "with open(%r, 'a') as log: log.write(json.dumps([name] + sys.argv[1:]) + '\\n')\n" % self.log +
            "path = pathlib.Path(%r)\n" % str(self.fixtures) +
            "fixtures = json.loads(path.read_text())\n" +
            "key = ' '.join(sys.argv[1:])\n" +
            "result = fixtures[name].get(key, '')\n" +
            "if isinstance(result, list):\n" +
            "    result = result.pop(0) if len(result) > 1 else result[0]\n" +
            "    path.write_text(json.dumps(fixtures))\n" +
            "if isinstance(result, dict):\n" +
            "    print(result.get('output', ''))\n" +
            "    sys.exit(result.get('code', 0))\n" +
            "print(result)\n")
        path.chmod(path.stat().st_mode | stat.S_IXUSR)

    def install_env(self, env_extra=None):
        return {"HOME": self.home, "PATH": self.bin + ":/usr/bin:/bin", "TERM": "dumb", **(env_extra or {})}

    def run_install(self, *args, source=INSTALL, env_extra=None):
        # Run outside any repository, so a git the test runs for real reads only the test's own config.
        result = subprocess.run(["bash", source] + list(args), capture_output=True, text=True,
                                env=self.install_env(env_extra), cwd=self.root, timeout=300)
        return result.returncode, result.stdout + result.stderr

    def fake_claude_with_plugin(self):
        self.fake_tool("claude", {"plugin list": PLUGIN + " (enabled)",
                                "plugin marketplace list": "❯ agent-blueprint\n  Source: GitHub (" + GITHUB + ")"})

    def fake_local_marketplaces(self, old="/old/checkout"):
        """Claude Code, Codex and Cursor CLI each registered from an old local checkout."""
        self.fake_tool("claude", {"plugin marketplace list": "❯ agent-blueprint\n  Source: Local (" + old + ")"})
        self.fake_tool("codex", {"plugin list --json": json.dumps({"installed": [{"pluginId": PLUGIN,
            "marketplaceSource": {"sourceType": "local", "source": old}}]})})
        self.fake_tool("cursor-agent", {"plugin marketplace list": "agent-blueprint user " + old})

    def catalog_dirs(self, host):
        """host_catalog_dirs HOST from hosts.sh, run in this test's home."""
        return subprocess.run(["bash", "-c", '. "$1"; host_catalog_dirs "$2"', "catalog",
            os.path.join(REPO, "skills/ab-ship-pipeline/scripts/hosts.sh"), host],
            env={"HOME": self.home, "PATH": self.bin + ":/usr/bin:/bin"}, cwd=self.root,
            text=True, capture_output=True)

    def calls(self):
        return [" ".join(json.loads(line)) for line in Path(self.log).read_text().splitlines()] if Path(self.log).exists() else []

    def cursor_calls(self):
        return [c for c in self.calls() if c.startswith("cursor-agent ")]

    def mutations(self):
        # The reachability check before a marketplace swap is asserted where it matters.
        return [c for c in self.calls() if " list" not in c and not c.startswith("git ")]

    def github_checks(self):
        return [c for c in self.calls() if c.startswith("git ls-remote")]

    def ab_skills(self, *parts):
        path = os.path.join(self.home, *parts)
        return sorted(d for d in os.listdir(path) if d.startswith("ab-")) if os.path.isdir(path) else []

    def earlier_copy(self, folder, *names):
        copy = Path(self.home, folder)
        for name in names:
            (copy / name).mkdir(parents=True, exist_ok=True)
        (copy / ".agent-blueprint-install.json").write_text(json.dumps({
            "plugin": "agent-blueprint", "version": "4.0.2", "source": "/old/checkout", "skills": names}, indent=2))
        return copy

    def routes(self):
        return Path(self.home, ".config", "agent-blueprint", "install-routes.json")

    def record_cursor_route(self):
        self.routes().parent.mkdir(parents=True, exist_ok=True)
        self.routes().write_text(json.dumps({"plugin": "agent-blueprint",
                                             "cursor-agent": {"marketplace": "agent-blueprint", "source": URL}}))

    def cursor_plugin_cache(self):
        """An agent-blueprint folder in Cursor's plugin cache, which also holds plugins that are not installed."""
        cache = Path(self.home, ".cursor/plugins/cache/team-marketplace/agent-blueprint/0123abc/skills")
        cache.mkdir(parents=True)
        return cache

    def cursor_uninstall_notes(self, out):
        # Cursor keeps marketplaces on the account, so the note points at /plugin and leaves the marketplace.
        return [line for line in out.splitlines() if line.startswith("  ! Cursor CLI: in /plugin, uninstall the "
                "agent-blueprint not marked (Claude Code)") and "cursor-agent plugin marketplace remove agent-blueprint" in line]

    def cursor_source_notes(self, out):
        # A marketplace from another source stays; the note names it and the two commands that switch it.
        return len([line for line in out.splitlines() if line.startswith("  ! Cursor CLI: your Cursor account's "
                    "agent-blueprint marketplace comes from ") and "cursor-agent plugin marketplace remove agent-blueprint"
                    in line and "cursor-agent plugin marketplace add " + URL in line])

    def pi_packages(self, *packages):
        settings = Path(self.home, ".pi/agent/settings.json")
        settings.parent.mkdir(parents=True, exist_ok=True)
        settings.write_text(json.dumps({"packages": list(packages)}))
        return settings

    def unreachable_github(self):
        self.fake_tool("git", {GITHUB_CHECK.split(" ", 1)[1]: {"code": 128}})

    def warnings(self, out, text="Could not read"):
        return [line for line in out.splitlines() if line.startswith("  ! ") and text in line]
