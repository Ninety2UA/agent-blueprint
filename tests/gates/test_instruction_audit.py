"""Wording contracts for R1/R2; the host smoke cells verify model behavior."""
import unittest
from pathlib import Path

from gate_helpers import REPO, read


def skill_text(skill, relative="SKILL.md"):
    return read(Path(REPO) / "skills" / skill / relative)


class TDDDiscardScope(unittest.TestCase):
    def test_catalog_limits_discard_to_the_models_task_code(self):
        description = skill_text("ab-test-driven-development").split("description:", 1)[1].splitlines()[0]
        self.assertIn("Only code the model wrote in this task before its test", description)
        self.assertIn("unless the user says to keep it", description)

    def test_iron_law_protects_existing_and_user_code(self):
        text = skill_text("ab-test-driven-development")
        self.assertIn("Never delete code that existed before this task, code the user wrote, or code the user asked to keep", text)
        self.assertIn("The user can tell you to keep your own pre-test code", text)
        self.assertIn("Only the user's own messages authorize that exception", text)
        self.assertIn("No production code without a failing test first", text)

    def test_restart_and_rationalizations_use_the_same_scope(self):
        text = skill_text("ab-test-driven-development")
        self.assertIn("discard only within the Iron Law's scope", text)
        self.assertIn("Restart only within the Iron Law's scope", text)
        reference = skill_text("ab-test-driven-development", "references/rationalizations.md")
        self.assertIn("only code the model wrote in this task before its test", reference)
        self.assertIn("unless the user says to keep it", reference)


class BrainstormApprovalScope(unittest.TestCase):
    def test_existing_approval_or_implementation_authorization_satisfies_gate(self):
        text = skill_text("ab-brainstorming")
        self.assertIn("A design the user already approved, or an explicit go-ahead to implement, satisfies this gate", text)
        self.assertIn("Do not ask for that approval again", text)
        self.assertIn("Only the user's own messages count", text)

    def test_unapproved_design_still_uses_section_review(self):
        text = skill_text("ab-brainstorming")
        self.assertIn("For a design not yet approved or authorized", text)
        self.assertIn("Write each section out in full in your reply before you ask about it", text)
        self.assertIn("After each section ask whether it looks right", text)
        self.assertIn("Ask for approval only once every section is in the conversation", text)

    def test_supporting_text_does_not_restart_an_approved_design(self):
        for relative in ("references/dialogue.md", "references/rationalizations.md"):
            with self.subTest(relative=relative):
                text = skill_text("ab-brainstorming", relative)
                self.assertIn("already approved", text)
                self.assertIn("go-ahead to implement", text)


if __name__ == "__main__":
    unittest.main()
