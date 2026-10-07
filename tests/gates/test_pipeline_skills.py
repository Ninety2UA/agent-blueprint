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

from gate_helpers import (REPO, USE_WHEN, questions_without_default, read, skill_description,
                          skill_frontmatter, skill_prose)

PIPELINE = ["ab-build-pipeline", "ab-ship-pipeline", "ab-brainstorming", "ab-writing-plans", "ab-executing-plans",
            "ab-review-swarm", "ab-requesting-code-review", "ab-systematic-debugging", "ab-quick-fix",
            "ab-subagent-driven-development", "ab-iterative-refinement", "ab-autonomous-loop", "ab-session-wrap",
            "ab-finishing-a-development-branch", "ab-test-driven-development", "ab-orchestrate", "ab-deep-research"]
# Skills that commit their own work or pick a review range (KTD7).
COMMITS_OR_REVIEWS = ["ab-build-pipeline", "ab-ship-pipeline", "ab-executing-plans", "ab-review-swarm",
                      "ab-requesting-code-review", "ab-systematic-debugging", "ab-quick-fix",
                      "ab-subagent-driven-development", "ab-iterative-refinement", "ab-finishing-a-development-branch",
                      "ab-test-driven-development", "ab-orchestrate"]


def skill_md(name):
    return read(os.path.join(REPO, "skills", name, "SKILL.md"))


def release_version():
    return json.loads(read(os.path.join(REPO, ".claude-plugin", "plugin.json")))["version"]


class PipelineSkills(unittest.TestCase):
    def test_each_carries_the_release_version(self):
        version = re.escape(release_version())
        for name in PIPELINE:
            self.assertRegex(skill_frontmatter(name), r'(?m)^metadata:\n  version: "%s"$' % version, name)

    def test_each_writes_its_provenance_record(self):
        for name in PIPELINE:
            self.assertIn("**Provenance record.**", skill_md(name), name)

    def test_each_that_commits_or_reviews_has_no_commit_mode(self):
        for name in COMMITS_OR_REVIEWS:
            self.assertIn("**No-commit mode.**", skill_prose(name), name)

    def test_every_question_names_a_headless_default(self):
        missing = ["%s: question %d" % (name, i) for name in PIPELINE for i in questions_without_default(skill_prose(name))]
        self.assertEqual(missing, [], "a question without a headless default stalls an unattended run")

    def test_descriptions_lead_with_what_the_skill_does(self):
        for name in PIPELINE:
            text = skill_description(name)
            self.assertNotRegex(text, r"(?i)^trigger this skill", name)
            self.assertRegex(text, USE_WHEN, name)
            self.assertLessEqual(len(text), 1024, name)

    def test_no_pipeline_skill_is_allowlisted(self):
        data = json.loads(read(os.path.join(REPO, "scripts", "portability-allowlist.json")))
        listed = [p for p in data.get("skills", {}) if any(p.startswith("skills/%s/" % n) for n in PIPELINE)]
        self.assertEqual(listed, [])


class ShipPipelineRunState(unittest.TestCase):
    def setUp(self):
        self.text = skill_prose("ab-ship-pipeline")
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
