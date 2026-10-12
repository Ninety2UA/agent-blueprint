"""ab-brainstorming writes out each design section before it asks about it.

A tutorial run asked the user to approve design sections that never appeared
in the conversation, only their headings. Step 5 must tell the agent to put
each section in full in its reply before the question, and the approval
question must come after the sections are on screen.
"""
import os
import re
import unittest

from gate_helpers import REPO, read

SKILL = os.path.join(REPO, "skills", "ab-brainstorming", "SKILL.md")


def step(text, heading):
    """The body of a ### step, up to the next ### heading."""
    m = re.search(r"^### %s\n(.*?)(?=^### |\Z)" % re.escape(heading), text, re.MULTILINE | re.DOTALL)
    return m.group(1) if m else ""


class PresentTheDesign(unittest.TestCase):
    def setUp(self):
        self.step = step(read(SKILL), "5. Present the design")
        self.assertTrue(self.step, "ab-brainstorming step 5 heading changed; re-point this test")

    def test_each_section_is_written_out_before_the_question(self):
        self.assertIn("Write each section out in full in your reply before you ask about it", self.step)

    def test_a_heading_or_summary_is_not_a_section(self):
        self.assertIn("a heading or a one-line summary is not a section", self.step)

    def test_approval_comes_after_the_sections_are_shown(self):
        self.assertIn("Ask for approval only once every section is in the conversation", self.step)


if __name__ == "__main__":
    unittest.main()
