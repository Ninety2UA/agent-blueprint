"""U9: every skill meets the rules, and the allowlist's skills section is empty (KTD12, KTD13).

Extends the pipeline-skill checks to all skills: descriptions lead with what the
skill does, every question names a headless default, and the one manual-only
skill in this phase is hidden from the others.
"""
import json
import os
import re
import unittest

from gate_helpers import REPO

SKILLS = os.path.join(REPO, "skills")
ASK = "**Asking the user.**"
FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def skill_names():
    return sorted(d for d in os.listdir(SKILLS) if os.path.isfile(os.path.join(SKILLS, d, "SKILL.md")))


def prose(name):
    """SKILL.md and the skill's own references, without prompt files and assets."""
    root = os.path.join(SKILLS, name)
    parts = []
    for dirpath, dirs, files in os.walk(root):
        rel = os.path.relpath(dirpath, root).split(os.sep)
        if rel[0] == "assets" or "agents" in rel:
            continue
        parts += [read(os.path.join(dirpath, f)) for f in sorted(files) if f.endswith(".md")]
    return "\n".join(parts)


def frontmatter(name):
    return FRONTMATTER.match(read(os.path.join(SKILLS, name, "SKILL.md"))).group(1)


class AllSkills(unittest.TestCase):
    def test_allowlist_skills_section_is_empty(self):
        data = json.loads(read(os.path.join(REPO, "scripts", "portability-allowlist.json")))
        self.assertEqual(data.get("skills"), {})

    def test_descriptions_lead_with_what_the_skill_does(self):
        bad = []
        for name in skill_names():
            desc = re.search(r'^description:\s*"?(.*?)"?\s*$', frontmatter(name), re.MULTILINE).group(1)
            # KTD13: what the skill does, then when to use it ("Use when", or "Use before/after" a moment).
            if re.match(r"(?i)trigger this skill", desc) or not re.search(r"\bUse (?:when|before|after)\b", desc) \
                    or len(desc) > 1024:
                bad.append(name)
        self.assertEqual(bad, [])

    def test_every_question_names_a_headless_default(self):
        missing = []
        for name in skill_names():
            paragraphs = re.split(r"\n\s*\n", prose(name))
            for i, para in enumerate(paragraphs):
                if not para.strip().startswith(ASK):
                    continue
                after = []
                for nxt in paragraphs[i + 1:i + 6]:
                    if nxt.lstrip().startswith("#") or nxt.strip().startswith(ASK):
                        break
                    after.append(nxt)
                if not re.search(r"(?i)\bdefault\b", " ".join(after)):
                    missing.append("%s: question %d" % (name, i))
        self.assertEqual(missing, [])


class PluginUpdateIsManualOnly(unittest.TestCase):
    def test_flag_and_codex_policy(self):
        self.assertRegex(frontmatter("ab-plugin-update"), r"(?m)^disable-model-invocation: true$")
        policy = read(os.path.join(SKILLS, "ab-plugin-update", "agents", "openai.yaml"))
        self.assertRegex(policy, r"(?m)^policy:\s*\n\s+allow_implicit_invocation:\s*false\s*$")

    def test_no_other_skill_names_it(self):
        hits = [n for n in skill_names() if n != "ab-plugin-update" and "ab-plugin-update" in prose(n)]
        self.assertEqual(hits, [])

    def test_description_avoids_a_bare_update_trigger(self):
        desc = re.search(r'^description:\s*"?(.*?)"?\s*$', frontmatter("ab-plugin-update"), re.MULTILINE).group(1)
        self.assertIn("Agent Blueprint", desc)

    def test_no_pipe_into_a_shell(self):
        self.assertNotRegex(read(os.path.join(SKILLS, "ab-plugin-update", "SKILL.md")), r"\|\s*(?:ba|z)?sh\b|\|\s*python")


if __name__ == "__main__":
    unittest.main()
