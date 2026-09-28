"""U2: every skill carries the ab- prefix, and skills refer to each other in prose.

Run: python3 -m unittest discover -s tests/gates
"""
import csv
import os
import re
import subprocess
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKILLS = os.path.join(REPO, "skills")
NAME_MAP = os.path.join(REPO, "docs", "upgrade", "v4-skill-names.tsv")
FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
NAME_LINE = re.compile(r"^name:\s*(\S+)\s*$", re.MULTILINE)
# A prose reference is an ab-<name> token that is not part of a longer word or path.
PROSE_REF = re.compile(r"(?<![A-Za-z0-9_./-])ab-[a-z0-9]+(?:-[a-z0-9]+)*")


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def skill_dirs():
    return sorted(d for d in os.listdir(SKILLS) if os.path.isfile(os.path.join(SKILLS, d, "SKILL.md")))


def name_map():
    with open(NAME_MAP, encoding="utf-8") as fh:
        return list(csv.DictReader(fh, delimiter="\t"))


def skill_markdown():
    """Every markdown file inside a skill directory (SKILL.md, references, prompts)."""
    for root, _dirs, files in os.walk(SKILLS):
        for name in files:
            if name.endswith(".md"):
                yield os.path.join(root, name)


def slash_reference(names):
    alt = "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True))
    return re.compile(r"(?<![A-Za-z0-9_.~:-])/(%s)(?![A-Za-z0-9_-])" % alt)


def unknown_prose_refs(text, known):
    """ab- tokens in text that do not name an existing skill."""
    return sorted({m.group(0) for m in PROSE_REF.finditer(text)} - set(known))


class SkillNames(unittest.TestCase):
    def test_every_directory_is_prefixed_and_matches_its_name(self):
        for d in skill_dirs():
            self.assertTrue(d.startswith("ab-"), "%s: skill directory lacks the ab- prefix" % d)
            text = read(os.path.join(SKILLS, d, "SKILL.md"))
            fm = FRONTMATTER.match(text)
            self.assertIsNotNone(fm, "%s: no frontmatter" % d)
            name = NAME_LINE.search(fm.group(1))
            self.assertIsNotNone(name, "%s: frontmatter has no name" % d)
            self.assertEqual(name.group(1), d, "%s: frontmatter name %r differs from directory" % (d, name.group(1)))

    def test_name_map_covers_every_v3_skill_and_points_at_real_skills(self):
        rows = name_map()
        self.assertEqual(len(rows), 55, "name map must keep one row per v3 skill")
        self.assertEqual(len({r["v3_name"] for r in rows}), 55, "duplicate v3 names in the name map")
        on_disk = set(skill_dirs())
        for r in rows:
            self.assertFalse(r["v3_name"].startswith("ab-"), "%s: v3 names carry no prefix" % r["v3_name"])
            self.assertIn(r["v4_name"], on_disk, "%s -> %s: new name not on disk" % (r["v3_name"], r["v4_name"]))

    def test_skills_on_disk_are_exactly_the_name_map_targets(self):
        self.assertEqual(set(skill_dirs()), {r["v4_name"] for r in name_map()})

    def test_no_slash_reference_to_any_old_or_new_name(self):
        rows = name_map()
        pattern = slash_reference([r["v3_name"] for r in rows] + [r["v4_name"] for r in rows])
        hits = []
        for path in skill_markdown():
            for n, line in enumerate(read(path).splitlines(), 1):
                for m in pattern.finditer(line):
                    hits.append("%s:%d: /%s" % (os.path.relpath(path, REPO), n, m.group(1)))
        self.assertEqual(hits, [], "slash skill references in skill files (use prose, KTD4):\n" + "\n".join(hits))

    def test_every_prose_reference_names_an_existing_skill(self):
        known = skill_dirs()
        hits = []
        for path in skill_markdown():
            for ref in unknown_prose_refs(read(path), known):
                hits.append("%s: %s" % (os.path.relpath(path, REPO), ref))
        self.assertEqual(hits, [], "references to skills that do not exist:\n" + "\n".join(hits))

    def test_prose_reference_check_catches_a_missing_skill(self):
        known = ["ab-writing-plans", "ab-review-swarm"]
        text = "Use the `ab-writing-plans` skill, then `ab-review-swarms` and ab-nope. Leave tab-width and x/ab-y alone."
        self.assertEqual(unknown_prose_refs(text, known), ["ab-nope", "ab-review-swarms"])

    def test_drift_gate_still_passes(self):
        result = subprocess.run(["bash", os.path.join(REPO, "scripts", "check-drift.sh")],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        derived = re.search(r"Derived ground truth: \S*?(\d+)\S* skills", result.stdout)
        self.assertIsNotNone(derived, result.stdout)
        self.assertEqual(int(derived.group(1)), len(skill_dirs()))


if __name__ == "__main__":
    unittest.main()
