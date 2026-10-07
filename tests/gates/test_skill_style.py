"""U9: every skill meets the rules, and the allowlist's skills section is empty (KTD12, KTD13).

Extends the pipeline-skill checks to all skills: descriptions lead with what the
skill does, every question names a headless default, and the one manual-only
skill in this phase is hidden from the others.
"""
import json
import os
import re
import unittest

from gate_helpers import (REPO, USE_WHEN, questions_without_default, read, skill_description,
                          skill_frontmatter, skill_prose)

SKILLS = os.path.join(REPO, "skills")


def skill_names():
    return sorted(d for d in os.listdir(SKILLS) if os.path.isfile(os.path.join(SKILLS, d, "SKILL.md")))


class AllSkills(unittest.TestCase):
    def test_allowlist_skills_section_is_empty(self):
        data = json.loads(read(os.path.join(REPO, "scripts", "portability-allowlist.json")))
        self.assertEqual(data.get("skills"), {})

    def test_descriptions_lead_with_what_the_skill_does(self):
        bad = [name for name in skill_names()
               if re.match(r"(?i)trigger this skill", skill_description(name))
               or not USE_WHEN.search(skill_description(name)) or len(skill_description(name)) > 1024]
        self.assertEqual(bad, [])

    def test_every_question_names_a_headless_default(self):
        missing = ["%s: question %d" % (name, i) for name in skill_names()
                   for i in questions_without_default(skill_prose(name))]
        self.assertEqual(missing, [])


class PluginUpdateIsManualOnly(unittest.TestCase):
    def test_flag_and_codex_policy(self):
        self.assertRegex(skill_frontmatter("ab-plugin-update"), r"(?m)^disable-model-invocation: true$")
        policy = read(os.path.join(SKILLS, "ab-plugin-update", "agents", "openai.yaml"))
        self.assertRegex(policy, r"(?m)^policy:\s*\n\s+allow_implicit_invocation:\s*false\s*$")

    def test_no_other_skill_names_it(self):
        hits = [n for n in skill_names() if n != "ab-plugin-update" and "ab-plugin-update" in skill_prose(n)]
        self.assertEqual(hits, [])

    def test_description_avoids_a_bare_update_trigger(self):
        self.assertIn("Agent Blueprint", skill_description("ab-plugin-update"))

    def test_no_pipe_into_a_shell(self):
        self.assertNotRegex(read(os.path.join(SKILLS, "ab-plugin-update", "SKILL.md")), r"\|\s*(?:ba|z)?sh\b|\|\s*python")


if __name__ == "__main__":
    unittest.main()
