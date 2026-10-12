"""U15: direct routes, source swaps and recorded-copy migrations in isolated homes."""
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
    from .gate_helpers import REPO, read
except ImportError:
    from gate_helpers import REPO, read

INSTALL = os.path.join(REPO, "install.sh")
SKILLS = sorted(d for d in os.listdir(os.path.join(REPO, "skills")) if os.path.isfile(os.path.join(REPO, "skills", d, "SKILL.md")))
GITHUB = "Ninety2UA/agent-blueprint"
URL = "https://github.com/" + GITHUB
PI_SOURCE = "git:github.com/" + GITHUB
PLUGIN = "agent-blueprint@agent-blueprint"


class Installer(unittest.TestCase):
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

    def run_install(self, *args, source=INSTALL, env_extra=None):
        env = {"HOME": self.home, "PATH": self.bin + ":/usr/bin:/bin", "TERM": "dumb"}
        env.update(env_extra or {})
        result = subprocess.run(["bash", source] + list(args), capture_output=True, text=True, env=env, timeout=300)
        return result.returncode, result.stdout + result.stderr

    def fake_claude_with_plugin(self):
        self.fake_tool("claude", {"plugin list": PLUGIN + " (enabled)",
                                "plugin marketplace list": "❯ agent-blueprint\n  Source: GitHub (" + GITHUB + ")"})

    def calls(self):
        return [" ".join(json.loads(line)) for line in Path(self.log).read_text().splitlines()] if Path(self.log).exists() else []

    def mutations(self):
        return [c for c in self.calls() if " list" not in c]

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

    def test_github_sources_are_the_default(self):
        for tool in ("claude", "codex", "agy", "grok", "pi", "hermes", "cursor-agent", "amp"):
            self.fake_tool(tool)
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        for command in ("claude plugin marketplace add " + GITHUB,
                        "claude plugin install " + PLUGIN,
                        "codex plugin marketplace add " + GITHUB,
                        "codex plugin add " + PLUGIN,
                        "agy plugin install " + URL,
                        "grok plugin install " + GITHUB + " --trust",
                        "pi install " + PI_SOURCE):
            self.assertIn(command, self.calls())
        self.assertEqual(self.ab_skills(".hermes", "skills"), SKILLS)
        self.assertEqual(self.ab_skills(".agents", "skills"), [])
        self.assertFalse(any(c.startswith(("cursor-agent ", "amp ")) for c in self.calls()))
        self.assertIn("/hooks", out)

    def test_local_sources_are_the_checkout(self):
        for tool in ("claude", "codex", "agy", "grok", "pi"):
            self.fake_tool(tool)
        code, out = self.run_install("--local")
        self.assertEqual(code, 0, out)
        for command in ("claude plugin marketplace add " + REPO,
                        "codex plugin marketplace add " + REPO,
                        "agy plugin install " + REPO,
                        "grok plugin install " + REPO + " --trust",
                        "pi install " + REPO):
            self.assertIn(command, self.calls())

    def test_old_shared_and_split_copies_are_retired(self):
        copies = [self.earlier_copy(folder, *SKILLS) for folder in
                  (".agents/skills", ".grok/skills", ".pi/agent/skills")]
        hermes = self.earlier_copy(".hermes/skills", "ab-retired")
        for copy in copies:
            (copy / "my-own-skill").mkdir()
        for tool in ("grok", "pi", "hermes"):
            self.fake_tool(tool)
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        for copy in copies:
            self.assertEqual(sorted(p.name for p in copy.iterdir()), ["my-own-skill"])
        self.assertEqual(self.ab_skills(".hermes", "skills"), SKILLS)
        self.assertFalse((hermes / "ab-retired").exists())
        self.assertIn("grok plugin install " + GITHUB + " --trust", self.calls())
        self.assertIn("pi install " + PI_SOURCE, self.calls())

    def test_unrecorded_and_foreign_copies_are_kept(self):
        mine = self.earlier_copy(".grok/skills", "ab-quick-fix")
        record = mine / ".agent-blueprint-install.json"
        record.write_text(record.read_text().replace('"agent-blueprint"', '"someone-else"'))
        unrecorded = Path(self.home, ".agents/skills/ab-quick-fix")
        unrecorded.mkdir(parents=True)
        self.fake_tool("grok")
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertTrue((mine / "ab-quick-fix").is_dir())
        self.assertTrue(unrecorded.is_dir())

    def test_cleanup_reads_only_safe_recorded_skill_names(self):
        copy = self.earlier_copy(".agents/skills", "ab-quick-fix")
        mine = copy / "ab-mine"
        mine.mkdir()
        record = copy / ".agent-blueprint-install.json"
        record.write_text(json.dumps({"plugin": "agent-blueprint", "source": '/work/"ab-mine"/checkout',
                                      "skills": ["ab-quick-fix", "../ab-mine"]}))
        self.fake_tool("grok")
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertFalse((copy / "ab-quick-fix").exists())
        self.assertTrue(mine.is_dir())

    def test_cursor_local_prints_plugin_dir_without_marketplace_calls(self):
        self.fake_tool("cursor-agent")
        code, out = self.run_install("--local")
        self.assertEqual(code, 0, out)
        self.assertIn("cursor-agent --plugin-dir " + REPO, out)
        self.assertEqual(self.calls(), [])
        self.assertFalse(self.routes().exists())

    def test_cursor_alone_is_recorded_and_unfinished(self):
        self.fake_tool("cursor-agent")
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertIn("cursor-agent plugin marketplace add " + URL, self.calls())
        self.assertIn("/plugin", out)
        self.assertRegex(out, r"(?i)unfinished[^\n]*Cursor")
        self.assertIn("agent-blueprint", self.routes().read_text())

    def test_cursor_and_amp_use_existing_claude_plugin_even_with_only(self):
        self.fake_claude_with_plugin()
        for tool in ("cursor-agent", "amp"):
            self.fake_tool(tool)
        code, out = self.run_install("--only", "cursor-agent,amp")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.mutations(), [])
        self.assertEqual(self.ab_skills(".config", "amp", "skills"), [])
        self.assertIn("Cursor CLI: covered by the Claude Code plugin", out)
        self.assertIn("Amp: covered by the Claude Code plugin", out)

    def test_standalone_cursor_and_amp_are_retired_when_claude_is_added(self):
        for tool in ("cursor-agent", "amp"):
            self.fake_tool(tool)
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        amp = Path(self.home, ".config/amp/skills")
        self.assertEqual(self.ab_skills(".config", "amp", "skills"), SKILLS)
        (amp / "my-own-skill").mkdir()
        self.fake_claude_with_plugin()
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertIn("cursor-agent plugin marketplace remove agent-blueprint", self.calls())
        self.assertEqual(sorted(p.name for p in amp.iterdir()), ["my-own-skill"])
        self.assertNotIn("cursor-agent", json.loads(self.routes().read_text()))
        Path(self.log).unlink()
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertFalse(any(c.startswith("cursor-agent ") for c in self.calls()))

    def test_amp_and_hermes_have_private_copies(self):
        for tool in ("amp", "hermes"):
            self.fake_tool(tool)
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        for parts in ((".config", "amp", "skills"), (".hermes", "skills")):
            self.assertEqual(self.ab_skills(*parts), SKILLS)
        self.assertEqual(self.ab_skills(".agents", "skills"), [])
        self.assertFalse(Path(self.home, ".hermes/config.yaml").exists())

    def test_claude_and_codex_source_swaps_and_updates(self):
        for local in (True, False):
            with self.subTest(local=local):
                old = GITHUB if local else REPO
                desired = REPO if local else GITHUB
                self.fake_tool("claude", {"plugin marketplace list": "❯ agent-blueprint\n Source: " +
                    ("GitHub (" + GITHUB + ")" if local else REPO), "plugin list": PLUGIN})
                self.fake_tool("codex", {"plugin marketplace list": "NAME  ROOT\nagent-blueprint  " + REPO,
                    "plugin list --json": json.dumps({"installed": [{"pluginId": PLUGIN,
                        "marketplaceSource": {"sourceType": "git" if local else "local", "source": old}}]})})
                Path(self.log).write_text("")
                code, out = self.run_install(*(["--local"] if local else []))
                self.assertEqual(code, 0, out)
                for tool in ("claude", "codex"):
                    remove = tool + " plugin marketplace remove agent-blueprint"
                    add = tool + " plugin marketplace add " + desired
                    self.assertIn(remove, self.calls())
                    self.assertIn(add, self.calls())
                    self.assertLess(self.calls().index(remove), self.calls().index(add))
                self.assertIn("claude plugin install " + PLUGIN, self.calls())
                self.assertIn("codex plugin add " + PLUGIN, self.calls())
        self.fake_claude_with_plugin()
        self.fake_tool("codex", {"plugin marketplace list": "NAME  ROOT\nagent-blueprint  /cache",
            "plugin list --json": json.dumps({"installed": [{"pluginId": PLUGIN,
                "marketplaceSource": {"sourceType": "git", "source": URL}}]})})
        Path(self.log).write_text("")
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        for command in ("claude plugin marketplace update agent-blueprint", "claude plugin update " + PLUGIN,
                        "codex plugin marketplace upgrade agent-blueprint", "codex plugin add " + PLUGIN):
            self.assertIn(command, self.calls())
        self.assertFalse(any("marketplace add" in c for c in self.calls()))

    def test_grok_removes_all_old_sources_then_installs_once(self):
        listings = ["  a: agent-blueprint [git: " + URL + "]\n  b: agent-blueprint [local: /old/checkout]",
                    "  a: agent-blueprint [git: " + URL + "]", "No plugins installed"]
        self.fake_tool("grok", {"plugin list": listings})
        code, out = self.run_install("--local")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.mutations(), ["grok plugin uninstall agent-blueprint"] * 2 +
                         ["grok plugin install " + REPO + " --trust"])

    def test_grok_same_git_source_updates(self):
        self.fake_tool("grok", {"plugin list": "  a: agent-blueprint [git: " + URL + "]"})
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.mutations(), ["grok plugin update agent-blueprint"])

    def test_pi_source_swap_uses_exact_stored_source(self):
        old = Path(self.home, "old checkout")
        old.mkdir()
        (old / "package.json").write_text(json.dumps({"name": "agent-blueprint"}))
        base = Path(self.home, ".pi/agent")
        base.mkdir(parents=True)
        relative = os.path.relpath(old, base)
        (base / "settings.json").write_text(json.dumps({"packages": [relative, "npm:someone-else"]}))
        self.fake_tool("pi")
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.mutations(), ["pi remove " + relative, "pi install " + PI_SOURCE])
        (base / "settings.json").write_text(json.dumps({"packages": [PI_SOURCE]}))
        Path(self.log).write_text("")
        code, out = self.run_install("--local")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.mutations(), ["pi remove " + PI_SOURCE, "pi install " + REPO])
        Path(self.log).write_text("")
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.mutations(), ["pi update --extension " + PI_SOURCE])

    def test_listing_failure_warns_and_installs_without_deleting(self):
        self.fake_tool("grok", {"plugin list": {"code": 1, "output": "unavailable"}})
        self.fake_tool("codex", {"plugin marketplace list": {"code": 1}, "plugin list --json": {"code": 1}})
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertRegex(out, r"(?i)(could not|cannot|unable to) read")
        self.assertIn("grok plugin install " + GITHUB + " --trust", self.calls())
        self.assertFalse(any(" remove " in c or " uninstall " in c for c in self.calls()))

    def test_dry_run_prints_exact_commands_and_changes_nothing(self):
        copy = self.earlier_copy(".agents/skills", "ab-quick-fix")
        for tool in ("claude", "codex", "agy", "grok", "pi", "hermes", "cursor-agent", "amp"):
            self.fake_tool(tool)
        before = sorted(str(p.relative_to(self.home)) for p in Path(self.home).rglob("*"))
        for args, source in (([], GITHUB), (["--local"], REPO)):
            code, out = self.run_install("--dry-run", *args)
            self.assertEqual(code, 0, out)
            self.assertIn("would run: claude plugin marketplace add " + source, out)
            self.assertIn("would run: codex plugin marketplace add " + source, out)
            self.assertIn("would run: grok plugin install " + source + " --trust", out)
            self.assertIn("remove", out)
        self.assertEqual(before, sorted(str(p.relative_to(self.home)) for p in Path(self.home).rglob("*")))
        self.assertTrue((copy / "ab-quick-fix").is_dir())
        self.assertEqual(self.mutations(), [])

    def test_copy_dir_env_is_explicit_opt_in_and_keeps_unrecorded_skills(self):
        custom = Path(self.root, "custom-skills")
        (custom / "ab-quick-fix").mkdir(parents=True)
        (custom / "ab-quick-fix/SKILL.md").write_text("mine")
        code, out = self.run_install(env_extra={"AGENT_BLUEPRINT_COPY_DIR": str(custom)})
        self.assertEqual(code, 0, out)
        self.assertEqual((custom / "ab-quick-fix/SKILL.md").read_text(), "mine")
        self.assertTrue((custom / "ab-brainstorming/SKILL.md").exists())
        self.assertEqual(self.ab_skills(".agents", "skills"), [])

    def test_cursor_dry_run_and_xdg_route_record(self):
        self.fake_tool("cursor-agent")
        config = Path(self.root, "config space")
        code, out = self.run_install("--dry-run", env_extra={"XDG_CONFIG_HOME": str(config)})
        self.assertEqual(code, 0, out)
        self.assertIn("would run: cursor-agent plugin marketplace add " + URL, out)
        self.assertIn("/plugin", out)
        self.assertFalse(config.exists())
        self.assertEqual(self.mutations(), [])
        code, out = self.run_install(env_extra={"XDG_CONFIG_HOME": str(config)})
        self.assertEqual(code, 0, out)
        self.assertTrue((config / "agent-blueprint/install-routes.json").is_file())
        self.assertFalse(self.routes().exists())

    def test_cursor_existing_same_marketplace_uses_its_updater(self):
        self.fake_tool("cursor-agent", {"plugin marketplace list": "name  scope  url\nagent-blueprint user " + URL})
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.mutations(), ["cursor-agent plugin marketplace update agent-blueprint"])

    def test_unrecorded_cursor_marketplace_is_not_retired_for_claude(self):
        self.fake_claude_with_plugin()
        self.fake_tool("cursor-agent", {"plugin marketplace list": "agent-blueprint user " + URL})
        code, out = self.run_install("--only", "cursor-agent")
        self.assertEqual(code, 0, out)
        self.assertFalse(any(c.startswith("cursor-agent ") for c in self.calls()))

    def test_same_local_sources_use_the_hosts_update_routes(self):
        self.fake_tool("claude", {"plugin marketplace list": "❯ agent-blueprint\n Source: Local (" + REPO + ")",
                                  "plugin list": PLUGIN})
        self.fake_tool("codex", {"plugin marketplace list": "NAME  ROOT\nagent-blueprint " + REPO,
            "plugin list --json": json.dumps({"installed": [{"pluginId": PLUGIN,
                "marketplaceSource": {"sourceType": "local", "source": REPO}}]})})
        self.fake_tool("grok", {"plugin list": "  repo-hash: agent-blueprint [local: " + REPO + "]"})
        pi = Path(self.home, ".pi/agent")
        pi.mkdir(parents=True)
        (pi / "settings.json").write_text(json.dumps({"packages": [REPO]}))
        self.fake_tool("pi")
        code, out = self.run_install("--local")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.mutations(), ["claude plugin marketplace update agent-blueprint",
            "claude plugin update " + PLUGIN, "codex plugin add " + PLUGIN,
            "grok plugin update agent-blueprint", "pi update --extension " + REPO])

    def test_grok_local_to_github_removes_local_before_install(self):
        self.fake_tool("grok", {"plugin list": ["  repo-hash: agent-blueprint [local: " + REPO + "]",
                                               "No plugins installed"]})
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.mutations(), ["grok plugin uninstall agent-blueprint",
                                           "grok plugin install " + GITHUB + " --trust"])

    def test_grok_failed_removal_stops_before_adding_a_duplicate(self):
        self.fake_tool("grok", {"plugin list": "  repo-hash: agent-blueprint [local: /old/checkout]"})
        code, out = self.run_install()
        self.assertNotEqual(code, 0, out)
        self.assertIn("Could not confirm Grok removed", out)
        self.assertEqual(self.mutations(), ["grok plugin uninstall agent-blueprint"])

    def test_legacy_record_with_unescaped_source_is_migrated(self):
        copy = self.earlier_copy(".agents/skills", "ab-quick-fix")
        mine = copy / "ab-mine"
        mine.mkdir()
        record = copy / ".agent-blueprint-install.json"
        record.write_text(record.read_text().replace('/old/checkout', '/work/"ab-mine"/checkout'))
        self.fake_tool("grok")
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertFalse((copy / "ab-quick-fix").exists())
        self.assertTrue(mine.is_dir())

    def test_positional_scaffold_and_compatibility_flags_still_work(self):
        project = Path(self.root, "project")
        self.fake_tool("amp")
        code, out = self.run_install("--force", "--no-overwrite", str(project))
        self.assertEqual(code, 0, out)
        self.assertTrue((project / "AGENTS.md").is_file())
        self.assertEqual(self.ab_skills(".config", "amp", "skills"), SKILLS)

    def test_host_catalog_finds_native_grok_pi_and_cursor_copies(self):
        grok = Path(self.home, ".grok/installed-plugins/agent-blueprint-hash/skills")
        pi_base = Path(self.home, ".pi/agent")
        pi_git = pi_base / "git/github.com/Ninety2UA/agent-blueprint/skills"
        pi_local = Path(self.home, "local package/skills")
        cursor_base = Path(self.home, ".cursor/plugins/cache/agent-blueprint/agent-blueprint")
        old = cursor_base / "old/skills"
        newest = cursor_base / "new/skills"
        other_plugin = cursor_base.parent / "other/hash/skills"
        amp = Path(self.home, ".config/amp/skills")
        for path in (grok, pi_git, pi_local, old, newest, other_plugin, amp):
            path.mkdir(parents=True)
        os.utime(old.parent, (10, 10))
        os.utime(newest.parent, (20, 20))
        (pi_base / "settings.json").write_text(json.dumps({"packages": [
            PI_SOURCE, {"source": os.path.relpath(pi_local.parent, pi_base)}, "npm:unrelated"]}))
        for host, expected in (("grok", {str(grok)}), ("pi", {str(pi_git), str(pi_local)}),
                               ("cursor-agent", {str(newest), str(other_plugin)}), ("amp", {str(amp)})):
            result = subprocess.run(["bash", "-c", '. "$1"; host_catalog_dirs "$2"', "catalog",
                os.path.join(REPO, "skills/ab-ship-pipeline/scripts/hosts.sh"), host],
                env={"HOME": self.home, "PATH": self.bin + ":/usr/bin:/bin"}, cwd=self.root,
                text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual({os.path.realpath(p) for p in result.stdout.splitlines()},
                             {os.path.realpath(p) for p in expected}, host)

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
        for target in (os.path.join(checkout, "skills"), link, os.path.join(link, "not-created")):
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
