"""U5: agents live inside the skills that dispatch them, as prompt files (KTD2).

Checks the real tree: no agents/ directory, prompt files without frontmatter that
open with a role header and end with an Output section, no prompt that starts
helpers of its own, and every prompt a skill names present in that skill. A file
named <prompt>-<topic>.md beside <prompt>.md is a companion the prompt loads at a
point of use; it is a plain note, not a prompt. scripts/check-drift.sh carries a
bash copy of that rule for its prompt count; CompanionRuleCrossCheck runs the
copy over the same paths and fails when the two disagree.
"""
import glob
import os
import re
import shutil
import subprocess
import tempfile
import unittest

from gate_helpers import REPO, gate_module, read

AGENT_FILES = sorted(glob.glob(os.path.join(REPO, "skills", "*", "references", "agents", "*.md")))
CHECK_DRIFT = os.path.join(REPO, "scripts", "check-drift.sh")


def is_companion(path):
    """<prompt>-<topic>.md beside <prompt>.md: notes a prompt loads at a point of use, not a prompt itself.

    scripts/check-drift.sh counts prompts by the same rule; change both together
    (CompanionRuleCrossCheck fails when they disagree).
    """
    folder, name = os.path.split(path)
    stem = name[:-3]
    return any(os.path.isfile(os.path.join(folder, stem[:i] + ".md")) for i, ch in enumerate(stem) if ch == "-")


def drift_companion_loop():
    """The body of check-drift.sh's prompt-counting loop: given a path in $f it sets $companion and prints a prompt's file name."""
    m = re.search(r"(?s)while IFS= read -r f; do\n(.*?)\ndone \| sort -u", read(CHECK_DRIFT))
    if m is None:
        raise AssertionError("scripts/check-drift.sh no longer carries the prompt-counting loop this test extracts")
    return m.group(1)


def drift_verdicts(paths):
    """Run check-drift.sh's own loop over paths: {path: is a companion} and the prompt names it printed."""
    script = "while IFS= read -r f; do\n" + drift_companion_loop() + "\nprintf '%s\\t%s\\n' \"$companion\" \"$f\"\ndone\n"
    result = subprocess.run(["bash", "-c", script], input="".join(p + "\n" for p in paths),
                            capture_output=True, text=True, timeout=60)
    if result.returncode != 0 or result.stderr:
        raise AssertionError("check-drift.sh's companion loop failed: " + result.stderr)
    verdicts, names = {}, []
    for line in result.stdout.splitlines():
        flag, _, path = line.partition("\t")
        if path:
            verdicts[path] = flag == "true"
        else:
            names.append(line)
    return verdicts, names


PROMPTS = [p for p in AGENT_FILES if not is_companion(p)]
COMPANIONS = [p for p in AGENT_FILES if is_companion(p)]
# Imperative helper-starting wording, and one host's team or dispatch tools.
STARTS_HELPERS = re.compile(
    r"\b(?:dispatch|spawn|launch|start)\s+(?:a|an|another|the|parallel|one|two|\d+|multiple|several)?\s*"
    r"(?:helper|subagent|sub-agent|agent|worker|teammate)s?\b"
    r"|\b(?:Task|Agent) tool\b|\bTeamCreate\b|\bSendMessage\b|\bspawn_agent\b", re.IGNORECASE)
PROMPT_REF = re.compile(r"references/agents/([a-z0-9-]+)\.md")
FENCE = gate_module().FENCE   # the gate's own fence pattern, so the two cannot drift apart


class PromptFiles(unittest.TestCase):
    def test_agents_directory_is_gone(self):
        self.assertFalse(os.path.exists(os.path.join(REPO, "agents")))

    def test_there_are_prompt_files(self):
        self.assertGreaterEqual(len({os.path.basename(p) for p in PROMPTS}), 28)

    def test_no_prompt_has_frontmatter(self):
        bad = [os.path.relpath(p, REPO) for p in PROMPTS if read(p).startswith("---")]
        self.assertEqual(bad, [])

    def test_every_prompt_opens_with_a_role_header(self):
        bad = []
        for p in PROMPTS:
            lines = [l for l in read(p).splitlines() if l.strip()]
            if len(lines) < 2 or not lines[0].startswith("# ") or not lines[1].startswith("**Role.**"):
                bad.append(os.path.relpath(p, REPO))
        self.assertEqual(bad, [], "prompt files must open with '# Title' then a **Role.** line")

    def test_every_role_header_states_scope_effort_and_no_helpers(self):
        bad = []
        for p in PROMPTS:
            role = next(l for l in read(p).splitlines() if l.startswith("**Role.**"))
            if not (("Read-only" in role or "May write" in role)
                    and ("Safe at lower effort" in role or "session's effort" in role)
                    and "Start no helpers of your own" in role):
                bad.append(os.path.relpath(p, REPO))
        self.assertEqual(bad, [])

    def test_every_prompt_ends_with_the_output_section(self):
        bad = []
        for p in PROMPTS:
            text = FENCE.sub("", read(p))
            headings = re.findall(r"^## (.+)$", text, re.MULTILINE)
            if not headings or headings[-1].strip() != "Output":
                bad.append(os.path.relpath(p, REPO))
        self.assertEqual(bad, [], "the last ## heading of every prompt file must be '## Output'")

    def test_no_prompt_starts_helpers_of_its_own(self):
        hits = []
        for p in PROMPTS:
            for n, line in enumerate(read(p).splitlines(), 1):
                if "Start no helpers of your own" in line:
                    continue
                m = STARTS_HELPERS.search(line)
                if m:
                    hits.append("%s:%d: %s" % (os.path.relpath(p, REPO), n, m.group(0)))
        self.assertEqual(hits, [], "only the main session dispatches (KTD2):\n" + "\n".join(hits))

    def test_companions_are_plain_notes_their_prompt_names(self):
        bad = []
        for p in COMPANIONS:
            folder, name = os.path.split(p)
            stem = name[:-3]
            prompt = next(os.path.join(folder, stem[:i] + ".md") for i, ch in enumerate(stem) if ch == "-"
                          and os.path.isfile(os.path.join(folder, stem[:i] + ".md")))
            text = read(p)
            if text.startswith("---") or not text.startswith("# ") or name not in read(prompt):
                bad.append(os.path.relpath(p, REPO))
        self.assertEqual(bad, [], "a companion has no frontmatter, opens with '# Title' and is named in its prompt")

    def test_no_prompt_carries_example_tags(self):
        """Empty <example> blocks were a v3 template leftover in 22 prompts; a prompt shows examples in prose."""
        bad = [os.path.relpath(p, REPO) for p in AGENT_FILES if "<example" in read(p)]
        self.assertEqual(bad, [])

    def test_no_team_lead_prompt(self):
        self.assertEqual([p for p in PROMPTS if os.path.basename(p) == "team-lead.md"], [])

    def test_every_named_prompt_exists_in_its_own_skill(self):
        missing = []
        for skill in sorted(glob.glob(os.path.join(REPO, "skills", "*"))):
            for path in glob.glob(os.path.join(skill, "**", "*.md"), recursive=True):
                if "/assets/" in path:
                    continue
                for name in set(PROMPT_REF.findall(FENCE.sub("", read(path)))):   # examples in fences are not dispatch sites
                    if not os.path.isfile(os.path.join(skill, "references", "agents", name + ".md")):
                        missing.append("%s names references/agents/%s.md" % (os.path.relpath(path, REPO), name))
        self.assertEqual(missing, [])

    def test_starts_helpers_pattern_catches_an_instruction(self):
        self.assertTrue(STARTS_HELPERS.search("Then dispatch a subagent for each file."))
        self.assertTrue(STARTS_HELPERS.search("Use the Task tool to fan out."))
        self.assertFalse(STARTS_HELPERS.search("Start no helpers of your own."))
        self.assertFalse(STARTS_HELPERS.search("When the dispatching step names an output contract"))


class CompanionRuleCrossCheck(unittest.TestCase):
    """check-drift.sh's bash copy of the companion rule and is_companion() give the same verdict on the same paths."""

    def test_drift_gate_agrees_with_is_companion_on_every_agent_file(self):
        verdicts, names = drift_verdicts(AGENT_FILES)
        self.assertEqual(verdicts, {p: is_companion(p) for p in AGENT_FILES})
        self.assertEqual(names, [os.path.basename(p) for p in PROMPTS], "the drift gate counts exactly the prompts")

    def test_drift_gate_agrees_with_is_companion_on_synthetic_cases(self):
        """Meaningful even when the tree holds no companion: a note beside its prompt, a nested topic, and a lone hyphenated prompt."""
        root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        beside, alone = os.path.join(root, "beside"), os.path.join(root, "alone")
        for folder in (beside, alone):
            os.makedirs(folder)
        expected = {os.path.join(beside, "foo.md"): False,
                    os.path.join(beside, "foo-bar.md"): True,
                    os.path.join(beside, "foo-bar-baz.md"): True,
                    os.path.join(alone, "foo-bar.md"): False}
        for path in expected:
            with open(path, "w", encoding="utf-8") as fh:
                fh.write("# note\n")
        paths = sorted(expected)
        self.assertEqual({p: is_companion(p) for p in paths}, expected)
        verdicts, names = drift_verdicts(paths)
        self.assertEqual(verdicts, expected)
        self.assertEqual(names, [os.path.basename(p) for p in paths if not expected[p]])


def run_drift_on_copy(change):
    """Runs the drift gate on a copy of the repository after change(copy root) edits it.

    The copy leaves out git data and the site's build output and caches (node_modules, dist, .astro).
    """
    root = tempfile.mkdtemp()
    try:
        copy = os.path.join(root, "repo")
        shutil.copytree(REPO, copy, symlinks=True,
                        ignore=shutil.ignore_patterns(".git", "node_modules", "dist", ".astro"))
        change(copy)
        result = subprocess.run(["bash", os.path.join(copy, "scripts", "check-drift.sh"), copy],
                                capture_output=True, text=True, timeout=120)
        return result.returncode, result.stdout + result.stderr
    finally:
        shutil.rmtree(root)


def run_drift_with(rel_path, extra):
    """Runs the drift gate on a copy of the repository with `extra` appended to one file."""
    def append(copy):
        with open(os.path.join(copy, rel_path), "a", encoding="utf-8") as fh:
            fh.write(extra)
    return run_drift_on_copy(append)


def appended_line(rel_path, extra, marker):
    """The line number where `marker` starts once run_drift_with appends `extra` to rel_path."""
    return (read(os.path.join(REPO, rel_path)) + extra[:extra.index(marker)]).count("\n") + 1


def edit_copy(copy, rel_path, pattern, replacement):
    """Replaces the first match of `pattern` (multiline) in one file of a repository copy."""
    path = os.path.join(copy, rel_path)
    text, n = re.subn(pattern, replacement, read(path), count=1, flags=re.MULTILINE)
    if n != 1:
        raise AssertionError("%s no longer matches %r" % (rel_path, pattern))
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


class DriftGateAgentCount(unittest.TestCase):
    """The drift gate fails a current-state surface that still counts agents (v4 has helper prompts)."""

    def test_agent_count_in_the_instructions_fails(self):
        code, out = run_drift_with("AGENTS.md", "\nThe plugin ships 29 specialized subagents.\n")
        self.assertNotEqual(code, 0, out)
        self.assertIn("still claims an agent count", out)

    def test_agent_count_in_the_readme_tree_fails(self):
        code, out = run_drift_with("README.md", "\n```\n\u2514\u2500\u2500 29 agents\n```\n")
        self.assertNotEqual(code, 0, out)
        self.assertIn("still lists an agent count", out)


class DriftGateHero(unittest.TestCase):
    """The README hero bakes its skill count into a GIF and a video, so the gate reads the hero's source."""

    def test_a_wrong_skill_count_in_the_hero_source_fails(self):
        hero = "site/motion/readme-hero/composition.html"
        code, out = run_drift_on_copy(lambda copy: edit_copy(copy, hero, r"\b\d+ skills that take a coding agent",
                                                             "54 skills that take a coding agent"))
        self.assertNotEqual(code, 0, out)
        self.assertIn(hero + ": claims 54 skills", out)


class DriftGateSiteSource(unittest.TestCase):
    """site/src/ and the film and loop compositions state no literal count (KTD4); the hero is checked above."""

    def test_a_literal_count_in_the_site_source_or_a_loop_fails(self):
        cases = (("site/src/components/Footer.astro", "\n<p>53 skills and 30 helper prompts</p>\n", "<p>",
                  ("53 skills", "30 helper prompts")),
                 ("site/motion/loop-review/composition.html", "\n<!-- 10 hooks -->\n", "<!--", ("10 hooks",)))

        def append(copy):
            for rel_path, extra, _marker, _counts in cases:
                with open(os.path.join(copy, rel_path), "a", encoding="utf-8") as fh:
                    fh.write(extra)
        code, out = run_drift_on_copy(append)
        self.assertNotEqual(code, 0, out)
        for rel_path, extra, marker, counts in cases:
            for count in counts:
                self.assertIn("%s:%d: literal count '%s'" % (rel_path, appended_line(rel_path, extra, marker), count),
                              out)
        self.assertNotIn("readme-hero/composition.html:", out)


class DriftGatePhaseTables(unittest.TestCase):
    """Every skill folder sits in exactly one README phase table, which the site is built from."""

    ROW = r"^\| \[ab-quick-fix\]\(skills/ab-quick-fix/\) \|.*\n"

    def test_a_skill_folder_missing_from_the_phase_tables_fails(self):
        code, out = run_drift_on_copy(lambda copy: edit_copy(copy, "README.md", self.ROW, ""))
        self.assertNotEqual(code, 0, out)
        self.assertIn("README.md Skills reference: skill folder ab-quick-fix is in no phase table", out)

    def test_a_skill_folder_in_two_phase_tables_fails(self):
        dup = "| [ab-quick-fix](skills/ab-quick-fix/) | Listed again | Never |\n"
        code, out = run_drift_on_copy(lambda copy: edit_copy(copy, "README.md", r"^(\| \[ab-migrate\]\(.*\n)",
                                                             r"\1" + dup))
        self.assertNotEqual(code, 0, out)
        self.assertIn("README.md Skills reference: skill folder ab-quick-fix has 2 rows (Pipelines, Meta)", out)


# Lines the v4 rewrite removed from README.md and index.html, verbatim.
REMOVED_ADOPTION_LINES = (
    ("README.md", "Before committing to any tool, it helps to understand the landscape. We've analyzed "
                  "**19 repos and frameworks** across the coding-agent ecosystem — over 1.15M combined GitHub "
                  "stars — through direct source code inspection, not marketing claims."),
    ("README.md", "### What's New in v3.7.0 — Ecosystem Imports"),
    ("README.md", "### What's New in v3.5.0 — Ecosystem Delta Sweep"),
    ("index.html", "        <h2>Ecosystem Analysis</h2>"),
    ("index.html", '            <tr><td>Compound Eng.</td><td>25.0K</td><td><span class="eco-verdict '
                   'eco-verdict--adopted">Patterns adopted</span></td></tr>'),
    ("index.html", "        <p>Ecosystem imports &mdash; twenty-one ideas from seven watched repositories grafted "
                   "onto existing skills and agents; no new components, every idea re-implemented in the "
                   "blueprint's own words, provenance recorded</p>"),
)


class DriftGateAdoption(unittest.TestCase):
    """The drift gate fails README.md or index.html when it describes what was taken from other projects."""

    def assert_claim(self, rel_path, extra, marker, match=""):
        code, out = run_drift_with(rel_path, extra)
        self.assertNotEqual(code, 0, out)
        self.assertIn("%s:%d: adoption or ecosystem claim '%s"
                      % (rel_path, appended_line(rel_path, extra, marker), match), out)
        return out

    def test_adoption_claim_in_the_readme_fails(self):
        self.assert_claim("README.md", "\n## What we took from other repos\n", "## What", "What we took'")

    def test_project_name_on_the_site_fails(self):
        self.assert_claim("index.html", "\n<p>Patterns from the gstack project.</p>\n", "<p>", "gstack'")

    def test_lines_removed_in_the_v4_rewrite_fail(self):
        for rel_path, line in REMOVED_ADOPTION_LINES:
            with self.subTest(rel_path=rel_path, line=line.strip()[:50]):
                self.assert_claim(rel_path, "\n%s\n" % line, line)

    def test_a_phrase_split_by_a_wrap_a_tag_or_an_entity_fails_at_its_first_line(self):
        cases = (("README.md", "\nThe review stage keeps what we\ntook from another plugin.\n", "The review",
                  "what we took'"),
                 ("index.html", "\n<p>The review stage was <em>imported</em> from another plugin.</p>\n", "<p>",
                  "imported</em> from'"),
                 ("README.md", "\nThe review stage is what&nbsp;we took from another plugin.\n", "The review",
                  "what&nbsp;we took'"))
        for rel_path, extra, marker, match in cases:
            with self.subTest(rel_path=rel_path, match=match):
                self.assert_claim(rel_path, extra, marker, match)

    def test_a_claim_in_the_site_source_fails(self):
        cases = (("site/src/components/Footer.astro", "\n<p>Patterns adopted from the gstack project.</p>\n", "<p>",
                  "Patterns adopted'"),
                 ("site/motion/film/composition.html", "\n<!-- what we took from claude-squad -->\n", "<!--",
                  "what we took'"))
        for rel_path, extra, marker, match in cases:
            with self.subTest(rel_path=rel_path):
                self.assert_claim(rel_path, extra, marker, match)

    def test_two_claims_on_one_line_fail_once(self):
        extra = "\n<p>Patterns adopted from the gstack project.</p>\n"
        out = self.assert_claim("index.html", extra, "<p>", "Patterns adopted'")
        self.assertEqual(out.count("index.html:%d:" % appended_line("index.html", extra, "<p>")), 1, out)


if __name__ == "__main__":
    unittest.main()
