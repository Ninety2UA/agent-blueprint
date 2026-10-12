"""U7: upgrades follow the owning host, never a second skills copy.

These are instruction contracts, not live CLI tests. Only route notes linked
from SKILL.md count, since those are what an agent running the skill can load.
"""
import re
import unittest
from pathlib import Path

from gate_helpers import REPO


SKILL_DIR = Path(REPO) / "skills" / "ab-plugin-update"
PLUGIN = "agent-blueprint@agent-blueprint"


def section(text, title, level=2):
    marks = "#" * level
    match = re.search(
        rf"^{marks} {re.escape(title)}\n(.*?)(?=^#{{1,{level}}} |\Z)",
        text, re.MULTILINE | re.DOTALL,
    )
    return match.group(1) if match else ""


class PluginUpdateRoutes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.skill = (SKILL_DIR / "SKILL.md").read_text()
        cls.text = cls.skill
        for ref in sorted(set(re.findall(r"references/[\w/-]+\.md", cls.skill))):
            cls.text += "\n" + (SKILL_DIR / ref).read_text()

    def route(self, name):
        body = section(self.text, name)
        if not body:
            # The original skill used bold list entries instead of headings.
            label = "Codex" if name == "Codex plugin" else name
            match = re.search(
                rf"^- \*\*{re.escape(label)}\.\*\*(.*?)(?=^- \*\*|^## |\Z)",
                self.text, re.MULTILINE | re.DOTALL,
            )
            body = match.group(1) if match else ""
        self.assertTrue(body, f"Missing actionable route: {name}")
        return body

    def assert_ordered(self, text, *parts):
        offset = 0
        for part in parts:
            found = text.find(part, offset)
            self.assertGreaterEqual(found, 0, f"Missing or out of order: {part}")
            offset = found + len(part)

    def test_stays_manual_only_and_within_codex_byte_cap(self):
        frontmatter = self.skill.split("---", 2)[1]
        self.assertRegex(frontmatter, r"(?m)^disable-model-invocation: true$")
        policy = (SKILL_DIR / "agents" / "openai.yaml").read_text()
        self.assertRegex(policy, r"(?m)^\s+allow_implicit_invocation: false$")
        self.assertLessEqual(len(self.skill.encode()), 8000)

    def test_detection_covers_native_shared_and_legacy_locations(self):
        detect = section(self.skill, "Step 1: Find the install route")
        for location in (
            "~/.claude/plugins/cache/", "plugins/cache/agent-blueprint/agent-blueprint/",
            "~/.gemini/config/plugins/agent-blueprint/", "~/.grok/installed-plugins/",
            "~/.pi/agent/git/github.com/Ninety2UA/agent-blueprint/",
            "~/.pi/agent/settings.json", "~/.cursor/plugins/cache/",
            "~/.hermes/skills", "~/.config/amp/skills", "~/.agents/skills",
        ):
            with self.subTest(location=location):
                self.assertIn(location, detect)
        self.assertRegex(detect, r"Claude Code.*Cursor.*Amp")

    def test_codex_installed_plugin_takes_precedence_over_a_stale_copy(self):
        detect = section(self.skill, "Step 1: Find the install route")
        for token in ("codex plugin list --json", "installed", "pluginId", PLUGIN):
            self.assertIn(token, detect)
        self.assertRegex(detect, r"(?i)even if.*copy")
        self.assertRegex(detect, r"(?i)fails.*stop")

    def test_codex_uses_original_marketplace_source_not_snapshot_root(self):
        codex = self.route("Codex plugin")
        for token in ("marketplaceSource", "sourceType", "source",
                      "codex plugin marketplace list", "ROOT", "snapshot"):
            self.assertIn(token, codex)
        self.assertRegex(codex, r"(?i)unknown.*stop")

    def test_codex_git_upgrade_is_followed_by_plugin_add(self):
        branch = section(self.route("Codex plugin"), "Git marketplace", level=3)
        self.assert_ordered(branch, "codex plugin marketplace upgrade agent-blueprint",
                            f"codex plugin add {PLUGIN}")

    def test_codex_local_pull_is_followed_by_plugin_add(self):
        branch = section(self.route("Codex plugin"), "Local marketplace", level=3)
        self.assertIn("git checkout", branch)
        self.assertIn("local-change check", branch)
        self.assert_ordered(branch, 'git -C "<source>" pull --ff-only',
                            f"codex plugin add {PLUGIN}")

    def test_codex_verifies_the_installed_cache_and_stops_on_failure(self):
        codex = self.route("Codex plugin")
        for token in ("codex plugin list --json", ".codex-plugin/plugin.json",
                      "CODEX_HOME", "~/.codex", "newest version folder"):
            self.assertIn(token, codex)
        self.assertRegex(codex, r"(?i)fails.*report.*stop")
        self.assertIn("Never use the copy-install route", codex)

    def test_claude_updates_marketplace_then_plugin_and_keeps_scope(self):
        claude = self.route("Claude Code plugin")
        self.assert_ordered(claude, "claude plugin marketplace update agent-blueprint",
                            f"claude plugin update {PLUGIN}")
        for token in ("--scope project", "--scope local", "--yes", "/plugin"):
            self.assertIn(token, claude)

    def test_antigravity_reinstalls_from_full_url_or_local_checkout(self):
        agy = self.route("Antigravity")
        self.assertIn("agy plugin install https://github.com/Ninety2UA/agent-blueprint", agy)
        self.assertIn('agy plugin install "<checkout>"', agy)
        self.assertIn("Checkout", agy)

    def test_grok_updates_git_and_refreshes_local_copy_in_order(self):
        grok = self.route("Grok Build")
        self.assertIn("grok plugin update agent-blueprint", grok)
        self.assert_ordered(grok, "Checkout", "grok plugin uninstall agent-blueprint",
                            'grok plugin install "<checkout>" --trust')
        self.assertRegex(grok, r"(?i)confirm.*removed.*before")

    def test_pi_updates_git_but_only_pulls_a_local_path(self):
        pi = self.route("Pi")
        self.assertRegex(pi, r"pi update --(?:extension git:github.com/Ninety2UA/agent-blueprint|extensions)")
        self.assertIn("~/.pi/agent/settings.json", pi)
        self.assertIn("Checkout", pi)
        self.assertRegex(pi, r"(?i)only.*pull")

    def test_cursor_updates_own_marketplace_or_uses_claude(self):
        cursor = self.route("Cursor")
        self.assert_ordered(cursor, "cursor-agent plugin marketplace update agent-blueprint", "/plugin")
        self.assertIn("Claude Code plugin", cursor)
        self.assertIn("--plugin-dir", cursor)
        self.assertIn("Checkout", cursor)

    def test_hermes_and_amp_preserve_their_own_routes(self):
        self.assertIn("Copy install", self.route("Hermes"))
        amp = self.route("Amp")
        self.assertIn("Claude Code plugin", amp)
        self.assertIn("Copy install", amp)
        self.assertIn("~/.config/amp/skills", amp)

    def test_plugin_failures_and_old_versions_do_not_fall_back_to_copy(self):
        run = section(self.skill, "Step 2: Run the route's command")
        self.assertRegex(run, r"(?i)fails.*report.*stop")
        self.assertIn("never fall back to a copy install", run)
        self.assertNotRegex(self.text, r"(?i)(?:use|try) the copy-install route(?: instead)?[.,]")
        verify = section(self.skill, "Step 3: Check the version")
        self.assertIn("same route", verify)
        self.assertIn("do not switch", verify)
        self.assertNotIn("re-run of `install.sh` elsewhere", verify)

    def test_copies_use_fresh_checkout_dry_run_and_retire_legacy_shared_copy(self):
        copy = self.route("Copy install")
        self.assert_ordered(copy, "mktemp -d", "git clone --depth 1", "--dry-run",
                            'bash "$CHECKOUT/agent-blueprint/install.sh"`')
        for token in ("~/.agents/skills", "recorded", "removes", "each tool's own route"):
            self.assertIn(token, copy)
        self.assertNotRegex(self.text, r"--copy-dir\s+[^\n]*\.agents/skills")
        self.assertIn(".agent-blueprint-install.json", self.text)

    def test_checkout_stops_at_local_changes_without_discarding_them(self):
        checkout = self.route("Checkout")
        self.assert_ordered(checkout, "status --short", "stop", "pull --ff-only")
        self.assertRegex(checkout, r"(?i)show.*local changes")


if __name__ == "__main__":
    unittest.main()
