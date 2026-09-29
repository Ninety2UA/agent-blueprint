"""U8: the pipeline skills meet the portability and style rules (KTD3, KTD6, KTD7, KTD13).

Checks what a rewrite must leave behind in each batch-1 skill: its version and
provenance record, no-commit mode where it commits or reviews, a headless
default after every question, a description that leads with what the skill
does, and, for ab-ship-pipeline, the run-state contract instead of the DONE
sentinel.
"""
import json
import os
import re
import unittest

from gate_helpers import REPO

PIPELINE = ["ab-build-pipeline", "ab-ship-pipeline", "ab-brainstorming", "ab-writing-plans", "ab-executing-plans",
            "ab-review-swarm", "ab-requesting-code-review", "ab-systematic-debugging", "ab-quick-fix",
            "ab-subagent-driven-development", "ab-iterative-refinement", "ab-autonomous-loop", "ab-session-wrap",
            "ab-finishing-a-development-branch", "ab-test-driven-development", "ab-orchestrate", "ab-deep-research"]
# Skills that commit their own work or pick a review range (KTD7).
COMMITS_OR_REVIEWS = ["ab-build-pipeline", "ab-ship-pipeline", "ab-executing-plans", "ab-review-swarm",
                      "ab-requesting-code-review", "ab-systematic-debugging", "ab-quick-fix",
                      "ab-subagent-driven-development", "ab-iterative-refinement", "ab-finishing-a-development-branch",
                      "ab-test-driven-development", "ab-orchestrate"]
ASK = "**Asking the user.**"
FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def skill_md(name):
    return read(os.path.join(REPO, "skills", name, "SKILL.md"))


def skill_text(name):
    """SKILL.md plus every markdown reference of the skill, prompt files excluded."""
    root = os.path.join(REPO, "skills", name)
    parts = []
    for dirpath, _dirs, files in os.walk(root):
        if os.sep + "agents" in dirpath[len(root):]:
            continue
        parts += [read(os.path.join(dirpath, f)) for f in sorted(files) if f.endswith(".md")]
    return "\n".join(parts)


def release_version():
    return json.loads(read(os.path.join(REPO, ".claude-plugin", "plugin.json")))["version"]


def description(name):
    fm = FRONTMATTER.match(skill_md(name)).group(1)
    return re.search(r'^description:\s*"?(.*?)"?\s*$', fm, re.MULTILINE).group(1)


class PipelineSkills(unittest.TestCase):
    def test_each_carries_the_release_version(self):
        for name in PIPELINE:
            fm = FRONTMATTER.match(skill_md(name)).group(1)
            self.assertRegex(fm, r'(?m)^metadata:\n  version: "%s"$' % re.escape(release_version()), name)

    def test_each_writes_its_provenance_record(self):
        for name in PIPELINE:
            self.assertIn("**Provenance record.**", skill_md(name), name)

    def test_each_that_commits_or_reviews_has_no_commit_mode(self):
        for name in COMMITS_OR_REVIEWS:
            self.assertIn("**No-commit mode.**", skill_text(name), name)

    def test_every_question_names_a_headless_default(self):
        missing = []
        for name in PIPELINE:
            paragraphs = re.split(r"\n\s*\n", skill_text(name))
            for i, para in enumerate(paragraphs):
                if para.strip().startswith(ASK):
                    # The default follows the options, before the next heading or question.
                    after = []
                    for nxt in paragraphs[i + 1:i + 6]:
                        if nxt.lstrip().startswith("#") or nxt.strip().startswith(ASK):
                            break
                        after.append(nxt)
                    if not re.search(r"(?i)\bdefault\b", " ".join(after)):
                        missing.append("%s: question %d" % (name, i))
        self.assertEqual(missing, [], "a question without a headless default stalls an unattended run")

    def test_descriptions_lead_with_what_the_skill_does(self):
        for name in PIPELINE:
            text = description(name)
            self.assertNotRegex(text, r"(?i)^trigger this skill", name)
            self.assertIn("Use when", text, name)
            self.assertLessEqual(len(text), 1024, name)

    def test_no_pipeline_skill_is_allowlisted(self):
        data = json.loads(read(os.path.join(REPO, "scripts", "portability-allowlist.json")))
        listed = [p for p in data.get("skills", {}) if any(p.startswith("skills/%s/" % n) for n in PIPELINE)]
        self.assertEqual(listed, [])


class ShipPipelineRunState(unittest.TestCase):
    def setUp(self):
        self.text = skill_text("ab-ship-pipeline")
        self.contract = read(os.path.join(REPO, "skills", "ab-ship-pipeline", "references", "run-state.md"))

    def test_no_done_sentinel(self):
        self.assertNotIn("<promise>DONE</promise>", self.text)
        self.assertNotRegex(self.text, r"<promise>")

    def test_no_file_deletion(self):
        body = self.text.replace(self.contract, "")   # the contract itself states the rule against deleting
        self.assertNotRegex(body, r"\brm\s+-|\bunlink\b|\bshutil\.rmtree\b|\bgit clean\b")

    def test_names_every_state_field(self):
        fields = re.findall(r"^\| `([a-z_]+)` \| (?:string|integer|array|object) \|", self.contract, re.MULTILINE)
        self.assertGreaterEqual(len(fields), 10)
        skill = skill_md("ab-ship-pipeline")
        body = self.text.replace(self.contract, "")
        for field in fields:
            self.assertIn("`%s`" % field, body, field)
        self.assertIn("references/run-state.md", skill)

    def test_fixed_pr_body_path(self):
        self.assertIn(".agent-blueprint/run/pr-body.md", self.text.replace(self.contract, ""))

    def test_no_ship_loop_state_file(self):
        self.assertNotIn("ship-loop.md", self.text)


class ExecutingPlansNameMap(unittest.TestCase):
    def test_reads_its_own_name_map(self):
        self.assertIn("references/v4-skill-names.tsv", skill_md("ab-executing-plans"))
        copy = os.path.join(REPO, "skills", "ab-executing-plans", "references", "v4-skill-names.tsv")
        self.assertEqual(read(copy), read(os.path.join(REPO, "docs", "upgrade", "v4-skill-names.tsv")))

    def test_name_map_resolves_the_old_slash_form(self):
        rows = dict(line.split("\t")[:2] for line in read(os.path.join(
            REPO, "skills", "ab-executing-plans", "references", "v4-skill-names.tsv")).splitlines()[1:] if line)
        self.assertEqual(rows["executing-plans"], "ab-executing-plans")


if __name__ == "__main__":
    unittest.main()
