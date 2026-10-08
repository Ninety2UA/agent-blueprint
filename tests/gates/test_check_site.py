"""U10: scripts/check-site.py checks the built site against the repository tree (KTD5).

Each test builds a small tree and a dist folder that matches it in a temporary
directory, changes one thing and runs the gate on the pair. The tree has 53 skill
folders, two helper prompts (one shared by two skills, plus a companion note that
is not a prompt), three hook handlers, eight tools in the README install table and
version 4.0.1. The last test runs the gate on the real tree and compares the
ground truth it derives with the drift gate's.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
CHECK_SITE = os.path.join(REPO, "scripts", "check-site.py")
CHECK_DRIFT = os.path.join(REPO, "scripts", "check-drift.sh")
SITE_URL = "https://agent-blueprint.dbenger.com"
VERSION = "4.0.1"
TOOLS = [("Claude Code", "claude"), ("Codex", "codex"), ("Antigravity", "agy"), ("Grok Build", "grok"),
         ("Pi", "pi"), ("Cursor CLI", "cursor-agent"), ("Hermes", "hermes"), ("Amp", "amp")]
HELPERS = ["code-reviewer", "plan-checker"]
HOOKS = 3


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def readme():
    rows = "".join("| %s | `%s` | `bash install.sh --only %s` | [note](docs/hosts/%s.md) |\n" % (name, cmd, cmd, cmd)
                   for name, cmd in TOOLS)
    return ("# Agent Blueprint\n\n## Install\n\n| Tool | Command | Install route | Support note |\n"
            "|---|---|---|---|\n" + rows + "\nThe shared copy is one copy of `skills/`.\n")


class Site:
    """A tree and a dist folder built from it, in one temporary directory."""

    def __init__(self, skills=53):
        self.root = tempfile.mkdtemp(prefix="ab-site-")
        self.tree = os.path.join(self.root, "tree")
        self.dist = os.path.join(self.root, "dist")
        for i in range(1, skills + 1):
            self.add_skill("ab-skill-%02d" % i)
        agents = os.path.join(self.tree, "skills", "ab-skill-01", "references", "agents")
        write(os.path.join(agents, "code-reviewer.md"), "# Code reviewer\n")
        write(os.path.join(agents, "code-reviewer-catalog.md"), "# Catalog\n")   # a companion note, not a prompt
        write(os.path.join(agents, "plan-checker.md"), "# Plan checker\n")
        write(os.path.join(self.tree, "skills", "ab-skill-02", "references", "agents", "code-reviewer.md"),
              "# Code reviewer\n")                                                 # a shared copy, counted once
        hooks = [{"hooks": [{"type": "command", "command": "h%d.sh" % i}]} for i in range(HOOKS)]
        write(os.path.join(self.tree, "hooks", "claude-code.json"), json.dumps({"hooks": {"PreToolUse": hooks}}))
        write(os.path.join(self.tree, ".claude-plugin", "plugin.json"), json.dumps({"version": VERSION}))
        write(os.path.join(self.tree, "README.md"), readme())
        self.build()

    def add_skill(self, name):
        write(os.path.join(self.tree, "skills", name, "SKILL.md"), "---\nname: %s\n---\n\n# %s\n" % (name, name))

    def skills(self):
        return sorted(os.listdir(os.path.join(self.tree, "skills")))

    def page(self, rel, body, title="A page", description="What this page holds.", canonical=True):
        url = "/" + (rel[:-len("index.html")] if rel.endswith("index.html") else rel)
        head = ['<meta charset="utf-8">',
                "<title>%s</title>" % title if title is not None else "",
                '<meta name="description" content="%s">' % description if description is not None else "",
                '<link rel="canonical" href="%s%s">' % (SITE_URL, url) if canonical else "",
                '<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">']
        footer = ('<footer><p><span data-claim="skills">%d</span> skills that take a coding agent from an idea to a '
                  'reviewed pull request, in <span data-claim="tools">eight</span> coding CLIs.</p>'
                  '<a href="/changelog/" data-claim="version">v%s</a></footer>' % (len(self.skills()), VERSION))
        write(os.path.join(self.dist, rel),
              '<!DOCTYPE html><html lang="en"><head>%s</head><body>\n<main>\n%s\n</main>\n%s\n</body></html>\n'
              % ("".join(head), body, footer))
        return os.path.join(self.dist, rel)

    def build(self):
        """A dist that matches the tree: every page the gate checks, all of them passing."""
        shutil.rmtree(self.dist, ignore_errors=True)
        skills = self.skills()
        write(os.path.join(self.dist, "brand", "favicon.svg"), "<svg><title>Mark</title></svg>")
        write(os.path.join(self.dist, "media", "film.mp4"), "")
        self.page("index.html", "\n".join([
            "<h1>Agent Blueprint</h1>",
            '<p><span data-claim="skills">%d skills</span>, <span data-claim="helpers">%d</span> helper prompts, '
            '<span data-claim="hooks">%d</span> hook handlers, <span data-claim="tools">8</span> tools.</p>'
            % (len(skills), len(HELPERS), HOOKS),
            '<dl><dt>Version</dt><dd data-claim="version"><code>%s</code></dd></dl>' % VERSION,
            '<a href="/skills/">Skills</a> <a href="/skills/#helpers">Helpers</a> <a href="/skills/?phase=quality">Q</a>',
            '<a href="/changelog">Changelog</a> <a href="https://github.com/Ninety2UA/agent-blueprint">GitHub</a>',
            '<a href="mailto:someone@example.com">Mail</a> <img src="//cdn.example.com/x.png" alt="">',
            '<video src="/media/film.mp4"></video> <a href="#main">Top</a>',
        ]))
        self.page("skills/index.html", "\n".join(
            ['<a href="/skills/%s/">%s</a>' % (s, s) for s in skills]
            + ['<li data-helper="%s">%s</li>' % (h, h) for h in HELPERS]))
        for name in skills:
            self.page("skills/%s/index.html" % name, '<h1>%s</h1>\n<a href="/skills/">All skills</a>' % name)
        self.page("changelog/index.html", "<h2>v4.0.0</h2>\n<p>v4.0.0 shipped 53 skills and 30 helper prompts.</p>")
        self.page("404.html", '<h1>Not found</h1>\n<a href="/">Home</a>', canonical=False)
        # The gate skips Astro's assets and Pagefind's index: no metadata or link checks there.
        write(os.path.join(self.dist, "_astro", "frame.html"), '<a href="/nowhere/">x</a>')
        write(os.path.join(self.dist, "pagefind", "pagefind-ui.html"), '<a href="/nowhere/">x</a>')

    def edit(self, rel, old, new):
        path = os.path.join(self.dist, rel)
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        assert old in text, (rel, old)
        write(path, text.replace(old, new, 1))

    def run(self, dist=None, tree=None):
        result = subprocess.run([sys.executable, CHECK_SITE, dist or self.dist, tree or self.tree],
                                capture_output=True, text=True, timeout=120)
        return result.returncode, result.stdout + result.stderr

    def cleanup(self):
        shutil.rmtree(self.root, ignore_errors=True)


class CheckSiteTestCase(unittest.TestCase):
    def setUp(self):
        self.site = Site()
        self.addCleanup(self.site.cleanup)

    def assert_fails(self, *expected):
        code, out = self.site.run()
        self.assertEqual(code, 1, out)
        for text in expected:
            self.assertIn(text, out)
        return out


class Baseline(CheckSiteTestCase):
    def test_a_dist_that_matches_the_tree_passes(self):
        code, out = self.site.run()
        self.assertEqual(code, 0, out)
        # The companion note is not a prompt and the shared copy counts once: two helper prompts.
        self.assertIn("53 skills, 2 helper prompts, 3 hooks, 8 tools; version 4.0.1", out)

    def test_a_missing_dist_or_tree_exits_2(self):
        code, out = self.site.run(dist=os.path.join(self.site.root, "no-dist"))
        self.assertEqual(code, 2, out)
        self.assertIn("no-dist: no built site", out)
        shutil.rmtree(os.path.join(self.site.tree, "skills"))
        code, out = self.site.run()
        self.assertEqual(code, 2, out)
        self.assertIn("skills/: no skill folders", out)


class SkillPages(CheckSiteTestCase):
    def test_a_dist_with_52_skill_pages_fails_and_names_the_missing_skill(self):
        shutil.rmtree(os.path.join(self.site.dist, "skills", "ab-skill-17"))
        out = self.assert_fails("skills/ab-skill-17/index.html", "ab-skill-17")
        self.assertNotIn("ab-skill-16", out)

    def test_a_page_for_a_skill_the_tree_lacks_fails(self):
        self.site.page("skills/ab-gone/index.html", "<h1>ab-gone</h1>")
        self.assert_fails("skills/ab-gone/index.html", "ab-gone")


class HelperEntries(CheckSiteTestCase):
    def test_a_missing_helper_entry_fails_and_names_it(self):
        self.site.edit("skills/index.html", '<li data-helper="plan-checker">plan-checker</li>', "")
        self.assert_fails("plan-checker")

    def test_a_duplicate_helper_entry_fails_and_names_it(self):
        self.site.edit("skills/index.html", '<li data-helper="plan-checker">',
                       '<li data-helper="code-reviewer">again</li><li data-helper="plan-checker">')
        self.assert_fails("code-reviewer", "2 times")

    def test_an_entry_for_a_helper_the_tree_lacks_fails(self):
        self.site.edit("skills/index.html", '<li data-helper="plan-checker">',
                       '<li data-helper="old-helper">x</li><li data-helper="plan-checker">')
        self.assert_fails("old-helper")


class Claims(CheckSiteTestCase):
    def test_a_claim_that_disagrees_with_the_tree_fails_and_names_the_file(self):
        cases = (('<span data-claim="skills">54 skills</span>', 'data-claim="skills"', "54 skills", "53"),
                 ('<span data-claim="skills"><b>54</b> skills</span>', 'data-claim="skills"', "54 skills", "53"),
                 ('<span data-claim="helpers">3</span>', 'data-claim="helpers"', "3", "2"),
                 ('<span data-claim="hooks">4</span>', 'data-claim="hooks"', "4", "3"),
                 ('<span data-claim="tools">seven</span>', 'data-claim="tools"', "seven", "8"),
                 ('<span data-claim="version">v4.0.0</span>', 'data-claim="version"', "v4.0.0", "4.0.1"))
        for element, kind, said, truth in cases:
            with self.subTest(element=element):
                self.site.build()
                self.site.page("kit/index.html", "<p>%s</p>" % element)
                self.assert_fails("kit/index.html: %s says '%s', the tree has %s" % (kind, said, truth))

    def test_a_claim_with_no_count_or_an_unknown_kind_fails(self):
        self.site.page("kit/index.html", '<p><span data-claim="tools">many</span> and '
                                         '<span data-claim="agents">29</span></p>')
        self.assert_fails("kit/index.html: data-claim=\"tools\" says 'many'", 'kit/index.html: data-claim="agents"')

    def test_an_unmarked_old_count_passes_after_the_tree_grows_to_54_skills(self):
        self.site.add_skill("ab-skill-54")
        self.site.build()
        with open(os.path.join(self.site.dist, "changelog", "index.html"), encoding="utf-8") as fh:
            self.assertIn("53 skills", fh.read())
        code, out = self.site.run()
        self.assertEqual(code, 0, out)
        self.assertIn("54 skills", out)


class StraySkillFile(CheckSiteTestCase):
    def test_a_file_named_SKILL_md_fails(self):
        write(os.path.join(self.site.dist, "skills", "ab-skill-01", "SKILL.md"), "# ab-skill-01\n")
        self.assert_fails("skills/ab-skill-01/SKILL.md")


class AdoptionWording(CheckSiteTestCase):
    def test_a_banned_phrase_fails_once_per_line(self):
        path = self.site.page("guides/history/index.html", "\n".join([
            "<p>Patterns adopted from the gstack project.</p>",
            "<p>The review stage was <em>imported</em> from another plugin.</p>",
            "<p>The review stage keeps what we",
            "took from another plugin.</p>",
        ]))
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
        first = lines.index("<p>Patterns adopted from the gstack project.</p>") + 1
        out = self.assert_fails("guides/history/index.html:%d: adoption or ecosystem claim 'Patterns adopted'" % first,
                                "guides/history/index.html:%d: adoption or ecosystem claim 'imported</em> from'"
                                % (first + 1),
                                "guides/history/index.html:%d: adoption or ecosystem claim 'what we took'"
                                % (first + 2))
        self.assertEqual(out.count("guides/history/index.html:%d:" % first), 1, out)

    def test_the_denylist_is_the_shared_file(self):
        with open(os.path.join(REPO, "scripts", "adoption-denylist.json"), encoding="utf-8") as fh:
            denylist = json.load(fh)
        self.assertIn("gstack", "".join(denylist["phrases"]))
        for gate in (CHECK_SITE, CHECK_DRIFT):
            with open(gate, encoding="utf-8") as fh:
                text = fh.read()
            self.assertTrue("adoption-denylist.json" in text, "%s does not read the shared denylist" % gate)
            self.assertFalse("gstack" in text, "%s keeps its own copy of the phrases" % gate)


class InternalLinks(CheckSiteTestCase):
    def test_a_broken_link_fails_and_names_the_source_page(self):
        self.site.edit("skills/ab-skill-01/index.html", '<a href="/skills/">',
                       '<a href="/docs/missing/">Step 1</a> <a href="/docs/missing/#step-2">')
        out = self.assert_fails("skills/ab-skill-01/index.html: broken link /docs/missing/")
        self.assertEqual(out.count("/docs/missing/"), 1, out)   # once per page, whatever the fragment

    def test_a_missing_src_fails(self):
        os.remove(os.path.join(self.site.dist, "media", "film.mp4"))
        self.assert_fails("index.html: broken link /media/film.mp4")


class Metadata(CheckSiteTestCase):
    def test_a_page_without_title_description_or_canonical_fails(self):
        cases = ((dict(canonical=False), "no canonical link"),
                 (dict(title=""), "no title"),
                 (dict(description=None), "no meta description"),
                 (dict(description=" "), "no meta description"))
        for kwargs, problem in cases:
            with self.subTest(problem=problem, kwargs=kwargs):
                self.site.build()
                self.site.page("kit/index.html", "<h1>Kit</h1>", **kwargs)
                self.assert_fails("kit/index.html: %s" % problem)


class RealTree(unittest.TestCase):
    def test_ground_truth_matches_the_drift_gate(self):
        dist = tempfile.mkdtemp(prefix="ab-site-dist-")
        self.addCleanup(shutil.rmtree, dist, True)
        write(os.path.join(dist, "index.html"), "<title>x</title>")
        site = subprocess.run([sys.executable, CHECK_SITE, dist, REPO], capture_output=True, text=True, timeout=120)
        drift = subprocess.run(["bash", CHECK_DRIFT, REPO], capture_output=True, text=True, timeout=120)
        s = re.search(r"(\d+) skills, (\d+) helper prompts, (\d+) hooks, (\d+) tools; version (\S+)", site.stdout)
        d = re.search(r"(\d+) skills, (\d+) hooks, (\d+) helper prompts; version (\S+)", drift.stdout)
        self.assertIsNotNone(s, site.stdout + site.stderr)
        self.assertIsNotNone(d, drift.stdout + drift.stderr)
        self.assertEqual((s.group(1), s.group(3), s.group(2), s.group(5)), d.groups())
        with open(os.path.join(REPO, "README.md"), encoding="utf-8") as fh:
            rows = re.search(r"\| Tool \| Command \| Install route \| Support note \|\n\|[-| ]*\n((?:\|[^\n]*\n)+)",
                             fh.read())
        self.assertEqual(int(s.group(4)), len(rows.group(1).splitlines()))


if __name__ == "__main__":
    unittest.main()
