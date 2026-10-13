"""U3: scripts/check-manifests.py enforces the KTD10 manifest table and KTD11.

The valid manifest set is built in code rather than stored as files, so no
manifest-shaped file sits in the tree for a host to pick up.
"""
import json
import os
import tempfile
import unittest

from gate_helpers import Repo, run_gate

VERSION = "4.0.0"
URL = "https://github.com/Ninety2UA/agent-blueprint"


def valid_manifests():
    return {
        ".claude-plugin/plugin.json": {"name": "agent-blueprint", "version": VERSION},
        ".claude-plugin/marketplace.json": {"name": "agent-blueprint", "owner": {"name": "t"},
                                            "plugins": [{"name": "agent-blueprint", "source": "./"}]},
        ".codex-plugin/plugin.json": {"name": "agent-blueprint", "version": VERSION, "skills": "./skills/",
                                     "interface": {"category": "Developer Tools"}},
        ".agents/plugins/marketplace.json": {"name": "agent-blueprint",
                                             "plugins": [{"name": "agent-blueprint", "category": "Developer Tools",
                                                          "source": {"source": "local", "path": "./"}}]},
        "plugin.json": {"name": "agent-blueprint", "version": VERSION},
        ".grok-plugin/plugin.json": {"name": "agent-blueprint", "version": VERSION, "skills": "./skills/"},
        ".grok-plugin/marketplace.json": {"name": "agent-blueprint",
                                          "plugins": [{"name": "agent-blueprint", "source": URL + ".git"}]},
        ".cursor-plugin/plugin.json": {"name": "agent-blueprint", "version": VERSION},
        "package.json": {"name": "agent-blueprint", "version": VERSION, "private": True,
                         "pi": {"skills": ["./skills"]}},
    }


class ManifestGate(unittest.TestCase):
    def setUp(self):
        self.repo = Repo()
        self.manifests = valid_manifests()
        self.save()

    def tearDown(self):
        self.repo.cleanup()

    def save(self):
        for path, doc in self.manifests.items():
            self.repo.write(path, json.dumps(doc, indent=2) + "\n")

    def gate(self, *args):
        return run_gate("check-manifests.py", self.repo.root, *args)

    def assertFails(self, path, rule, *fragments):
        code, out = self.gate()
        self.assertEqual(code, 1, out)
        self.assertIn("%s: [%s]" % (path, rule), out)
        for f in fragments:
            self.assertIn(f, out)

    def test_valid_manifest_set_passes(self):
        code, out = self.gate()
        self.assertEqual(code, 0, out)

    def test_portability_gate_also_passes_the_fixture(self):
        code, out = run_gate("check-portability.py", self.repo.root)
        self.assertEqual(code, 0, out)

    def test_version_mismatch_between_two_manifests(self):
        self.manifests[".cursor-plugin/plugin.json"]["version"] = "3.9.0"
        self.save()
        self.assertFails(".cursor-plugin/plugin.json", "version", "3.9.0")

    def test_package_json_version_mismatch(self):
        self.manifests["package.json"]["version"] = "4.0.1"
        self.save()
        self.assertFails("package.json", "version", "4.0.1")

    def test_marketplace_entry_version_mismatch(self):
        self.manifests[".claude-plugin/marketplace.json"]["plugins"][0]["version"] = "3.8.0"
        self.save()
        self.assertFails(".claude-plugin/marketplace.json", "version")

    def test_skill_metadata_version_mismatch(self):
        self.repo.edit("skills/ab-fixture/SKILL.md", "  owner: gate-tests", '  owner: gate-tests\n  version: "3.8.0"')
        self.assertFails("skills/ab-fixture/SKILL.md", "version", "metadata.version 3.8.0")

    def test_skill_metadata_version_mismatch_without_pyyaml(self):
        self.repo.edit("skills/ab-fixture/SKILL.md", "  owner: gate-tests", '  owner: gate-tests\n  version: "3.8.0"')
        code, out = run_gate("check-manifests.py", self.repo.root, env={"PORTABILITY_FORCE_NO_YAML": "1"})
        self.assertEqual(code, 1, out)
        self.assertIn("skills/ab-fixture/SKILL.md: [version]", out)

    def test_skill_metadata_version_match_passes(self):
        self.repo.edit("skills/ab-fixture/SKILL.md", "  owner: gate-tests", '  owner: gate-tests\n  version: "%s"' % VERSION)
        code, out = self.gate()
        self.assertEqual(code, 0, out)

    def test_codex_manifest_without_skills_key(self):
        del self.manifests[".codex-plugin/plugin.json"]["skills"]
        self.save()
        self.assertFails(".codex-plugin/plugin.json", "skills-key")

    def test_grok_manifest_without_skills_key(self):
        self.manifests[".grok-plugin/plugin.json"]["skills"] = "./other/"
        self.save()
        self.assertFails(".grok-plugin/plugin.json", "skills-key")

    def test_schema_in_root_plugin_json(self):
        self.manifests["plugin.json"]["$schema"] = "https://agent-plugins.org/schema/plugin.json"
        self.save()
        self.assertFails("plugin.json", "root-manifest", "$schema")

    def test_skills_key_in_root_plugin_json(self):
        self.manifests["plugin.json"]["skills"] = "./skills/"
        self.save()
        self.assertFails("plugin.json", "root-manifest", "must not declare a skills key")

    def test_wrong_name(self):
        self.manifests[".grok-plugin/plugin.json"]["name"] = "claude-code-blueprint"
        self.save()
        self.assertFails(".grok-plugin/plugin.json", "name", "claude-code-blueprint")

    def test_wrong_marketplace_entry_name(self):
        self.manifests[".agents/plugins/marketplace.json"]["plugins"][0]["name"] = "blueprint"
        self.save()
        self.assertFails(".agents/plugins/marketplace.json", "name")

    def test_pi_package_needs_private_and_skills(self):
        self.manifests["package.json"] = {"name": "agent-blueprint", "version": VERSION}
        self.save()
        self.assertFails("package.json", "pi-package", "private", '"pi"')

    def test_hooks_json_fails(self):
        self.repo.write("hooks/hooks.json", '{"hooks": {}}\n')
        self.assertFails("hooks/hooks.json", "hooks-json", "Grok")

    def test_declared_hook_file_must_exist(self):
        self.manifests[".codex-plugin/plugin.json"]["hooks"] = "./hooks/codex.json"
        self.save()
        self.assertFails(".codex-plugin/plugin.json", "hook-files", "./hooks/codex.json")
        self.repo.write("hooks/codex.json", '{"hooks": {}}\n')
        code, out = self.gate()
        self.assertEqual(code, 0, out)

    def test_codex_categories(self):
        for path, entry in (
            (".codex-plugin/plugin.json", self.manifests[".codex-plugin/plugin.json"]["interface"]),
            (".agents/plugins/marketplace.json", self.manifests[".agents/plugins/marketplace.json"]["plugins"][0]),
        ):
            for category in ("Coding", "Unknown", None, ["Developer Tools"]):
                with self.subTest(path=path, category=category):
                    entry["category"] = category
                    self.save()
                    self.assertFails(path, "codex-category", "category")
            entry["category"] = "Developer Tools"
            self.save()
        code, out = self.gate()
        self.assertEqual(code, 0, out)

    def test_each_interface_asset_must_be_a_local_file(self):
        interface = self.manifests[".codex-plugin/plugin.json"]["interface"]
        self.repo.write("docs/images/icon.svg", "<svg/>\n")
        for key in ("composerIcon", "composerIconDark", "logo", "logoDark", "screenshots"):
            for path in ("./docs/images/missing.svg", "docs/images/icon.svg", "./docs/images",
                         "https://example.com/icon.svg", 7):
                with self.subTest(key=key, path=path):
                    interface[key] = [path] if key == "screenshots" else path
                    self.save()
                    self.assertFails(".codex-plugin/plugin.json", "interface-assets", key)
            interface[key] = ["./docs/images/icon.svg"] if key == "screenshots" else "./docs/images/icon.svg"
            self.save()
            code, out = self.gate()
            self.assertEqual(code, 0, out)

    def test_interface_asset_cannot_escape_via_parent_or_symlink(self):
        with tempfile.TemporaryDirectory(prefix="ab-assets-") as outside:
            target = os.path.join(outside, "icon.svg")
            with open(target, "w", encoding="utf-8") as fh:
                fh.write("<svg/>\n")
            os.symlink(outside, self.repo.path("linked-images"))
            for path in ("./" + os.path.relpath(target, self.repo.root), "./linked-images/icon.svg"):
                with self.subTest(path=path):
                    self.manifests[".codex-plugin/plugin.json"]["interface"]["logo"] = path
                    self.save()
                    self.assertFails(".codex-plugin/plugin.json", "interface-assets", "inside the repository")

    def test_interface_asset_symlink_inside_repo_passes(self):
        self.repo.write("docs/images/icon.svg", "<svg/>\n")
        os.symlink("icon.svg", self.repo.path("docs/images/logo.svg"))
        self.manifests[".codex-plugin/plugin.json"]["interface"]["logo"] = "./docs/images/logo.svg"
        self.save()
        code, out = self.gate()
        self.assertEqual(code, 0, out)

    def test_screenshots_must_be_a_list_of_paths(self):
        self.manifests[".codex-plugin/plugin.json"]["interface"]["screenshots"] = "./docs/images/icon.svg"
        self.save()
        self.assertFails(".codex-plugin/plugin.json", "interface-assets", "screenshots")

    def test_missing_manifest(self):
        os.remove(self.repo.path(".cursor-plugin/plugin.json"))
        self.assertFails(".cursor-plugin/plugin.json", "missing-manifest")

    def test_missing_manifest_allowlisted_then_stale(self):
        os.remove(self.repo.path(".cursor-plugin/plugin.json"))
        self.repo.allowlist(manifests={".cursor-plugin/plugin.json": ["missing-manifest"]})
        code, out = self.gate()
        self.assertEqual(code, 0, out)
        self.save()
        code, out = self.gate()
        self.assertEqual(code, 1, out)
        self.assertIn("no longer match a violation", out)

    def test_invalid_json(self):
        self.repo.write(".grok-plugin/plugin.json", "{ nope")
        self.assertFails(".grok-plugin/plugin.json", "missing-manifest", "not valid JSON")

    def assertNotAnObject(self, path, text):
        """A manifest that parses to a non-object is reported once, as missing-manifest,
        and is treated as absent by every other rule."""
        self.repo.write(path, text)
        self.assertFails(path, "missing-manifest", "is not a JSON object")
        code, out = self.gate()
        rules = [line.split("[", 1)[1].split("]", 1)[0]
                 for line in out.splitlines() if line.strip().startswith("%s: [" % path)]
        self.assertEqual(rules, ["missing-manifest"], out)

    def test_null_manifest(self):
        self.assertNotAnObject(".codex-plugin/plugin.json", "null\n")

    def test_array_manifest(self):
        self.assertNotAnObject(".claude-plugin/plugin.json", '["agent-blueprint", "4.0.0"]\n')

    def test_array_marketplace(self):
        self.assertNotAnObject(".grok-plugin/marketplace.json", '[{"name": "agent-blueprint"}]\n')

    def test_string_manifest(self):
        self.assertNotAnObject("package.json", '"agent-blueprint"\n')


if __name__ == "__main__":
    unittest.main()
