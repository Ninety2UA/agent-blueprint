"""U15: direct routes, source swaps and recorded-copy migrations in isolated homes."""
import json
import os
from pathlib import Path
import shutil
import unittest

try:
    from .gate_helpers import REPO, read
    from .install_harness import (GITHUB, PI_GIT_FORMS, PI_PARSER, PI_PINNED_FORMS, PI_SOURCE, PLUGIN, SKILLS,
                                  URL, InstallerHarness)
except ImportError:
    from gate_helpers import REPO, read
    from install_harness import (GITHUB, PI_GIT_FORMS, PI_PARSER, PI_PINNED_FORMS, PI_SOURCE, PLUGIN, SKILLS,
                                 URL, InstallerHarness)


class Installer(InstallerHarness):
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

    def test_filtered_claude_run_keeps_split_copies(self):
        copies = [self.earlier_copy(folder, *SKILLS) for folder in
                  (".grok/skills", ".pi/agent/skills")]
        records = {copy: (copy / ".agent-blueprint-install.json").read_text() for copy in copies}
        for tool in ("claude", "grok", "pi"):
            self.fake_tool(tool)
        code, out = self.run_install("--only", "claude")
        self.assertEqual(code, 0, out)
        for copy in copies:
            with self.subTest(copy=copy):
                self.assertEqual(sorted(p.name for p in copy.iterdir() if p.is_dir()), SKILLS)
                self.assertEqual((copy / ".agent-blueprint-install.json").read_text(), records[copy])
        self.assertEqual(self.mutations(), ["claude plugin marketplace add " + GITHUB,
                                           "claude plugin install " + PLUGIN])

    def test_filtered_grok_run_retires_only_groks_split_copy(self):
        grok = self.earlier_copy(".grok/skills", *SKILLS)
        pi = self.earlier_copy(".pi/agent/skills", *SKILLS)
        record = (pi / ".agent-blueprint-install.json").read_text()
        for tool in ("claude", "grok", "pi"):
            self.fake_tool(tool)
        code, out = self.run_install("--only", "grok")
        self.assertEqual(code, 0, out)
        self.assertEqual(list(grok.iterdir()), [])
        self.assertEqual(sorted(p.name for p in pi.iterdir() if p.is_dir()), SKILLS)
        self.assertEqual((pi / ".agent-blueprint-install.json").read_text(), record)
        self.assertEqual(self.mutations(), ["grok plugin install " + GITHUB + " --trust"])

    def test_filtered_codex_run_keeps_shared_copy_for_grok(self):
        copy = self.earlier_copy(".agents/skills", *SKILLS)
        record = (copy / ".agent-blueprint-install.json").read_text()
        for tool in ("codex", "grok"):
            self.fake_tool(tool)
        code, out = self.run_install("--only", "codex")
        self.assertEqual(code, 0, out)
        self.assertEqual(sorted(p.name for p in copy.iterdir() if p.is_dir()), SKILLS)
        self.assertEqual((copy / ".agent-blueprint-install.json").read_text(), record)
        self.assertRegex(out, r"(?m)^  ! [^\n]*grok")
        self.assertIn("install.sh without --only", out)
        self.assertIn("each skill twice", out)
        self.assertEqual(self.mutations(), ["codex plugin marketplace add " + GITHUB,
                                           "codex plugin add " + PLUGIN])

    def test_unfiltered_run_retires_shared_copy(self):
        copy = self.earlier_copy(".agents/skills", *SKILLS)
        (copy / "my-own-skill").mkdir()
        for tool in ("codex", "grok"):
            self.fake_tool(tool)
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertEqual(sorted(p.name for p in copy.iterdir()), ["my-own-skill"])
        self.assertEqual(self.mutations(), ["codex plugin marketplace add " + GITHUB,
                                           "codex plugin add " + PLUGIN,
                                           "grok plugin install " + GITHUB + " --trust"])

    def test_shared_warning_names_all_unselected_readers(self):
        copy = self.earlier_copy(".agents/skills", "ab-quick-fix")
        readers = ("codex", "grok", "pi", "cursor-agent", "amp")
        for tool in ("claude", *readers):
            self.fake_tool(tool)
        code, out = self.run_install("--only", "claude")
        self.assertEqual(code, 0, out)
        self.assertTrue((copy / "ab-quick-fix").is_dir())
        self.assertTrue((copy / ".agent-blueprint-install.json").is_file())
        warning = next(line for line in out.splitlines() if line.startswith("  ! ") and str(copy) in line)
        for tool in readers:
            self.assertIn(tool, warning)
        self.assertIn("install.sh without --only", warning)
        self.assertIn("each skill twice", warning)
        # Explicitly selecting all readers is sufficient even with another tool on PATH.
        code, out = self.run_install("--only", ",".join(readers))
        self.assertEqual(code, 0, out)
        self.assertEqual(list(copy.iterdir()), [])
        self.assertNotIn("each skill twice", out)

    def test_hermes_reading_the_shared_copy_keeps_it_until_hermes_is_in_the_run(self):
        copy = self.earlier_copy(".agents/skills", "ab-quick-fix")
        config = Path(self.home, ".hermes/config.yaml")
        config.parent.mkdir(parents=True)
        config.write_text("skills:\n  external_dirs:\n    - " + str(copy) + "\n")
        for tool in ("codex", "hermes"):
            self.fake_tool(tool)
        code, out = self.run_install("--only", "codex")
        self.assertEqual(code, 0, out)
        self.assertTrue((copy / "ab-quick-fix").is_dir())
        warning = next(line for line in out.splitlines() if line.startswith("  ! ") and str(copy) in line)
        self.assertIn("hermes", warning)
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertEqual(list(copy.iterdir()), [])
        self.assertIn("external_dirs", out)
        self.assertEqual(self.ab_skills(".hermes", "skills"), SKILLS)
        # Without that config entry, Hermes on PATH is not a reader of the shared copy.
        config.unlink()
        copy = self.earlier_copy(".agents/skills", "ab-quick-fix")
        code, out = self.run_install("--only", "codex")
        self.assertEqual(code, 0, out)
        self.assertEqual(list(copy.iterdir()), [])
        self.assertNotIn("external_dirs", out)

    def test_codex_marketplace_only_registration(self):
        root = Path(self.root, "old marketplace")
        (root / ".agents/plugins").mkdir(parents=True)
        (root / ".agents/plugins/marketplace.json").write_text(json.dumps({"name": "agent-blueprint"}))
        foreign = Path(self.root, "foreign marketplace")
        (foreign / ".agents/plugins").mkdir(parents=True)
        (foreign / ".agents/plugins/marketplace.json").write_text(json.dumps({"name": "someone-else"}))
        for marketplace_root, args, expected in (
            (root, [], ["codex plugin marketplace remove agent-blueprint",
                        "codex plugin marketplace add " + GITHUB, "codex plugin add " + PLUGIN]),
            (Path(REPO), ["--local"], ["codex plugin add " + PLUGIN]),
            (foreign, [], ["codex plugin marketplace add " + GITHUB, "codex plugin add " + PLUGIN]),
        ):
            with self.subTest(root=marketplace_root.name, args=args):
                self.fake_tool("codex", {"plugin list --json": json.dumps({"installed": []}),
                                         "plugin marketplace list": "NAME  ROOT\nagent-blueprint  " + str(marketplace_root)})
                Path(self.log).write_text("")
                code, out = self.run_install(*args)
                self.assertEqual(code, 0, out)
                self.assertEqual(self.mutations(), expected)
                self.assertEqual("Could not read Codex" in out, marketplace_root == foreign)

    def test_dry_run_preserves_legacy_copies_and_prints_scoped_cleanup(self):
        folders = (".agents/skills", ".grok/skills", ".pi/agent/skills")
        copies = [self.earlier_copy(folder, "ab-quick-fix") for folder in folders]
        for copy in copies:
            (copy / "ab-quick-fix/SKILL.md").write_text("old skill content")
        for tool in ("claude", "codex", "grok", "pi"):
            self.fake_tool(tool)
        before = {p: p.read_bytes() if p.is_file() else None for p in Path(self.home).rglob("*")}
        for args, retired, readers in (
            (["--only", "claude"], (), ("codex", "grok", "pi")),
            (["--only", "grok"], (".grok/skills",), ("codex", "pi")),
            (["--only", "pi"], (".pi/agent/skills",), ("codex", "grok")),
            (["--only", "codex"], (), ("grok", "pi")),
            ([], folders, ()),
        ):
            with self.subTest(args=args):
                code, out = self.run_install("--dry-run", *args)
                self.assertEqual(code, 0, out)
                for folder, copy in zip(folders, copies):
                    self.assertEqual("Would remove the recorded copy in " + str(copy) in out,
                                     folder in retired)
                    self.assertEqual("would run: rm -rf " + str(copy / "ab-quick-fix") in out,
                                     folder in retired)
                if readers:
                    warning = next(line for line in out.splitlines()
                                   if line.startswith("  ! ") and str(copies[0]) in line)
                    for tool in readers:
                        self.assertIn(tool, warning)
                    self.assertIn("install.sh without --only", warning)
                    self.assertIn("each skill twice", warning)
                else:
                    self.assertNotIn("each skill twice", out)
                self.assertEqual(before, {p: p.read_bytes() if p.is_file() else None
                                          for p in Path(self.home).rglob("*")})
                self.assertEqual(self.mutations(), [])

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
        self.assertRegex(out, r"(?m)^  ! Unfinished: Cursor CLI \(/plugin installation required\)$")
        self.assertNotRegex(out, r"Finished:[^\n]*Cursor")
        self.assertIn("agent-blueprint", self.routes().read_text())
        # With Amp beside it, Amp is Finished and Cursor stays Unfinished.
        self.fake_tool("amp")
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertRegex(out, r"(?m)^  ✓ Finished: Amp$")
        self.assertRegex(out, r"(?m)^  ! Unfinished: Cursor CLI")

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

    def test_pi_source_swap_names_each_package_as_pi_matches_it(self):
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
        self.assertEqual(self.mutations(), ["pi remove " + str(old), "pi install " + PI_SOURCE])
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
        self.fake_tool("claude", {"plugin marketplace list": "❯ agent-blueprint\n Source: Folder (" + REPO + ")",
                                  "plugin list": PLUGIN})
        self.fake_tool("codex", {"plugin marketplace list": "NAME  ROOT\nagent-blueprint " + REPO,
            "plugin list --json": json.dumps({"installed": [{"pluginId": PLUGIN,
                "marketplaceSource": {"sourceType": "local", "source": REPO}}]})})
        self.fake_tool("grok", {"plugin list": ["  repo-hash: agent-blueprint [local: " + REPO + "]",
                                               "No plugins installed"]})
        pi = Path(self.home, ".pi/agent")
        pi.mkdir(parents=True)
        # Pi stores a local path relative to ~/.pi/agent and resolves a command's argument against
        # the current folder, so the installer passes the absolute path. Pi removes a path with every
        # spelling of it, so the second spelling's removal takes the kept one too, and the checkout is
        # installed again.
        relative = os.path.relpath(REPO, pi)
        (pi / "settings.json").write_text(json.dumps({"packages": [relative, REPO]}))
        self.fake_tool("pi")
        code, out = self.run_install("--local")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.mutations(), ["claude plugin marketplace update agent-blueprint",
            "claude plugin update " + PLUGIN, "codex plugin add " + PLUGIN,
            "grok plugin uninstall agent-blueprint", "grok plugin install " + REPO + " --trust",
            "pi remove " + REPO, "pi install " + REPO])
        self.assertIn("  ▸ Pi: removing " + REPO + " also removes " + os.path.normpath(os.path.join(pi, relative)) +
                      " (Pi treats them as one package), so " + REPO + " is installed afterwards.", out)

    def test_grok_local_to_github_removes_local_before_install(self):
        self.fake_tool("grok", {"plugin list": ["  repo-hash: agent-blueprint [local: " + REPO + "]",
                                               "No plugins installed"]})
        code, out = self.run_install()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.mutations(), ["grok plugin uninstall agent-blueprint",
                                           "grok plugin install " + GITHUB + " --trust"])

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

    def test_unreadable_marketplace_listing_warns_once(self):
        for tool, listing in (("claude", "plugin marketplace list"), ("codex", "plugin list --json"),
                              ("cursor-agent", "plugin marketplace list")):
            with self.subTest(tool=tool):
                self.fake_tool(tool, {listing: {"code": 1}})
                Path(self.log).write_text("")
                code, out = self.run_install("--only", tool)
                self.assertEqual(code, 0, out)
                warnings = [line for line in out.splitlines() if line.startswith("  ! ") and "Could not read" in line]
                self.assertEqual(len(warnings), 1, out)
                self.assertIn(tool + " " + listing, warnings[0])
                self.assertIn(tool + " plugin marketplace add " + (URL if tool == "cursor-agent" else GITHUB),
                              self.calls())
                self.assertFalse(any(" remove " in c for c in self.calls()))

    def test_unattributable_source_warns_once_and_adds_without_removing(self):
        # A listed agent-blueprint whose source cannot be read: sources() warns through unknown().
        for tool, listings, label in (
            ("claude", {"plugin marketplace list": "❯ agent-blueprint\n  Scope: user"}, "Claude Code"),
            ("codex", {"plugin list --json": json.dumps({"installed": [{"pluginId": PLUGIN,
                "marketplaceSource": {"sourceType": "git"}}]})}, "Codex"),
        ):
            with self.subTest(tool=tool):
                self.fake_tool(tool, listings)
                Path(self.log).write_text("")
                code, out = self.run_install("--only", tool)
                self.assertEqual(code, 0, out)
                warnings = self.warnings(out)
                self.assertEqual(len(warnings), 1, out)
                self.assertIn("Could not read " + label + "'s", warnings[0])
                self.assertIn(tool + " plugin marketplace add " + GITHUB, self.calls())
                self.assertFalse(any(" remove " in c for c in self.calls()))

    def test_unreadable_grok_and_pi_sources_warn_once(self):
        settings = Path(self.home, ".pi/agent/settings.json")
        settings.parent.mkdir(parents=True)
        for tool, prepare, install in (
            ("grok", lambda: self.fake_tool("grok", {"plugin list": {"code": 1, "output": "unavailable"}}),
             "grok plugin install " + GITHUB + " --trust"),
            ("grok", lambda: self.fake_tool("grok", {"plugin list": "  x: agent-blueprint (origin unknown)"}),
             "grok plugin install " + GITHUB + " --trust"),
            ("pi", lambda: settings.write_text("{not json"), "pi install " + PI_SOURCE),
        ):
            with self.subTest(tool=tool, install=install):
                self.fake_tool(tool)
                prepare()
                Path(self.log).write_text("")
                code, out = self.run_install("--only", tool)
                self.assertEqual(code, 0, out)
                self.assertEqual(len(self.warnings(out)), 1, out)
                self.assertEqual(self.mutations(), [install])

    def test_pi_git_source_forms_are_one_source(self):
        self.fake_tool("pi")
        pinned_forms = {template.format(GITHUB) for template in PI_PINNED_FORMS}
        # GitHub names are case-insensitive, so a differently cased spelling is the same source.
        for form in [template.format(GITHUB) for template in PI_GIT_FORMS] + ["git:GitHub.com/" + GITHUB.lower()]:
            with self.subTest(form=form):
                self.pi_packages(form)
                Path(self.log).write_text("")
                code, out = self.run_install("--only", "pi")
                self.assertEqual(code, 0, out)
                if form in pinned_forms:
                    self.assertEqual(self.mutations(), ["pi remove " + form, "pi install " + PI_SOURCE])
                    self.assertIn("Pi: replacing the pinned source " + form, out)
                else:
                    self.assertEqual(self.mutations(), ["pi update --extension " + form])
                    self.assertNotIn("pinned", out)

    def test_pinned_pi_source_is_replaced_with_a_warning(self):
        self.fake_tool("pi")
        https = "git:https://github.com/" + GITHUB
        for pinned in (PI_SOURCE + "#v4.0.2", PI_SOURCE + "@v4.0.2"):
            # Pi removes a git source with every entry of its repository: removing the pin also removes
            # an unpinned entry, so the run installs again rather than update it, and a second pin of
            # the same repository is already gone.
            for packages, expected in (
                ([pinned], ["pi remove " + pinned, "pi install " + PI_SOURCE]),
                ([pinned, https], ["pi remove " + pinned, "pi install " + PI_SOURCE]),
                ([pinned, PI_SOURCE + "#v4.0.1"], ["pi remove " + pinned, "pi install " + PI_SOURCE]),
            ):
                with self.subTest(packages=packages):
                    self.pi_packages(*packages)
                    Path(self.log).write_text("")
                    code, out = self.run_install("--only", "pi")
                    self.assertEqual(code, 0, out)
                    self.assertEqual(self.mutations(), expected)
                    warning = next(line for line in out.splitlines() if line.startswith("  ! ") and pinned in line)
                    self.assertEqual(warning, "  ! Pi: replacing the pinned source " + pinned + " with " +
                                     PI_SOURCE + "; pin it again in Pi if you need that version.")
                    self.assertEqual(https in packages, "  ▸ Pi: removing " + pinned + " also removes " + https +
                                     " (Pi treats them as one package), so " + PI_SOURCE + " is installed afterwards."
                                     in out.splitlines())

    def test_pi_local_paths_are_read_as_pi_reads_them(self):
        # A source that is neither npm: nor git is a path relative to ~/.pi/agent to Pi, such as git@host:path
        # without git: or a URL Pi cannot read as git; install.sh and the host catalog read them alike.
        base = Path(self.home, ".pi/agent")
        scp, bare = base / "git@github.com:x/y", base / "http:/github.com"
        for package in (scp, bare):
            (package / "skills").mkdir(parents=True)
            (package / "package.json").write_text(json.dumps({"name": "agent-blueprint"}))
        self.pi_packages("git@github.com:x/y", "http://github.com")
        result = self.catalog_dirs("pi")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(sorted(os.path.realpath(p) for p in result.stdout.splitlines()),
                         sorted(os.path.realpath(p / "skills") for p in (scp, bare)))
        self.fake_tool("pi")
        code, out = self.run_install("--only", "pi")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.mutations(), ["pi remove " + str(scp), "pi remove " + str(bare), "pi install " + PI_SOURCE])

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
            result = self.catalog_dirs(host)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual({os.path.realpath(p) for p in result.stdout.splitlines()},
                             {os.path.realpath(p) for p in expected}, host)

    def test_host_catalog_reads_every_pi_git_form(self):
        pi_base = Path(self.home, ".pi/agent")
        skills = pi_base / "git/github.com/x/y/skills"
        skills.mkdir(parents=True)
        forms = ["git:github.com/x/y", *(template.format("x/y") for template in PI_GIT_FORMS), "git:github.com/x/y#v1.0"]
        for form in forms:
            with self.subTest(form=form):
                (pi_base / "settings.json").write_text(json.dumps({"packages": [form]}))
                result = self.catalog_dirs("pi")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual([os.path.realpath(p) for p in result.stdout.splitlines()],
                                 [os.path.realpath(skills)])
        # Elsewhere than GitHub, Pi keeps .git and a trailing slash after it in the clone's folder name.
        custom = pi_base / "git/git.example.com/a/b.git/skills"
        custom.mkdir(parents=True)
        (pi_base / "settings.json").write_text(json.dumps({"packages": ["git:https://git.example.com/a/b.git/"]}))
        result = self.catalog_dirs("pi")
        self.assertEqual([os.path.realpath(p) for p in result.stdout.splitlines()], [os.path.realpath(custom)])
        # Loading pi_source.py, here and in install.sh, leaves no bytecode cache in the skill's folder.
        self.fake_tool("pi")
        code, out = self.run_install("--only", "pi")
        self.assertEqual(code, 0, out)
        self.assertFalse(os.path.exists(os.path.join(os.path.dirname(PI_PARSER), "__pycache__")))

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
        shutil.copytree(REPO, checkout, symlinks=True, ignore=shutil.ignore_patterns(".git", "node_modules", "dist", ".astro"))
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
        shutil.copytree(REPO, checkout, symlinks=True, ignore=shutil.ignore_patterns(".git", "node_modules", "dist", ".astro"))
        installer = os.path.join(checkout, "install.sh")
        link = os.path.join(self.root, "alias")
        os.symlink(os.path.join(checkout, "skills"), link)
        self.fake_tool("agy")
        for target in (os.path.join(checkout, "skills"), link, os.path.join(link, "not-created")):
            code, out = self.run_install("--copy-dir", target, source=installer)
            self.assertEqual(code, 2, out)
            self.assertIn("own skills folder", out)
            self.assertEqual(self.mutations(), [], "refused before any route ran")
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
