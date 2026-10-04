"""One file-count threshold across skills: under three files is a quick fix, three or more is design.

A review found the boundary spelled several ways. FORBIDDEN holds the drifted
spellings, so the next one is a one-line addition; the skills that define the
boundary must carry the canonical phrase.
"""
import os
import re
import unittest

from gate_helpers import REPO, read

SKILLS = os.path.join(REPO, "skills")
CANONICAL = "under three files"
BOUNDARY_SKILLS = ("ab-quick-fix", "ab-brainstorming")
# Digit, off-by-one and inverted spellings of the quick-fix boundary; matched case-insensitively.
FORBIDDEN = ("up to 3 files", "up to three files", "4 or more files", "four or more files", "4+ files", "< 3 files",
             "under 3 files", "3 or more files")
DRIFT = re.compile("|".join(re.escape(s) for s in FORBIDDEN), re.IGNORECASE)


def threshold_files():
    """Every SKILL.md and references file, plus the scaffold's AGENTS.md (the other assets are templates)."""
    paths = [os.path.join(SKILLS, "ab-project-start", "assets", "AGENTS.md")]
    for dirpath, dirs, files in os.walk(SKILLS):
        dirs[:] = sorted(d for d in dirs if d != "assets")
        paths += [os.path.join(dirpath, f) for f in sorted(files) if f.endswith(".md")]
    return paths


class FileCountThreshold(unittest.TestCase):
    def test_no_drifted_spelling(self):
        hits = ["%s: %s" % (os.path.relpath(path, REPO), m.group(0))
                for path in threshold_files() for m in DRIFT.finditer(read(path))]
        self.assertEqual(hits, [])

    def test_boundary_skills_spell_it_canonically(self):
        for name in BOUNDARY_SKILLS:
            self.assertIn(CANONICAL, read(os.path.join(SKILLS, name, "SKILL.md")), name)


if __name__ == "__main__":
    unittest.main()
