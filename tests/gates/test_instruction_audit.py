"""Wording contracts for R1-R3; the host smoke cells verify model behavior."""
import unittest
from pathlib import Path

from gate_helpers import REPO, read, skill_description


def skill_text(skill, relative="SKILL.md"):
    return read(Path(REPO) / "skills" / skill / relative)


class TDDDiscardScope(unittest.TestCase):
    def test_catalog_limits_discard_to_the_models_task_code(self):
        description = skill_description("ab-test-driven-development")
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
    def test_design_approval_seen_design_authorization_or_waiver_satisfies_gate(self):
        text = skill_text("ab-brainstorming")
        gate = text.split("**Hard gate.**", 1)[1].split("\n\n", 1)[0]
        self.assertIn("the user approved the design", gate)
        self.assertIn("explicitly told you to implement a design they have seen", gate)
        self.assertIn("explicitly told you to skip the design step", gate)
        self.assertIn("Do not ask for that approval again", gate)
        self.assertIn("Only the user's own messages count", gate)
        self.assertIn("Stay in the normal conversation rather than a host's plan mode, unless the user asks for that mode", gate)

    def test_code_request_alone_does_not_meet_gate(self):
        gate = skill_text("ab-brainstorming").split("**Hard gate.**", 1)[1].split("\n\n", 1)[0]
        self.assertIn("A request that only asks for code, with no design yet and no explicit waiver, does not meet the gate", gate)
        self.assertIn("until the design is presented and approved through the steps below", gate)

    def test_description_scopes_implementation_authorization_to_a_seen_design(self):
        description = skill_description("ab-brainstorming")
        self.assertIn("prior design approval, authorization to implement a seen design, or an explicit design waiver", description)
        self.assertIn("including when the user jumps straight to code on such work", description)

    def test_unapproved_design_still_uses_section_review(self):
        text = skill_text("ab-brainstorming")
        self.assertIn("For a design not yet approved or authorized", text)
        self.assertIn("Write each section out in full in your reply before you ask about it", text)
        self.assertIn("After each section ask whether it looks right", text)
        self.assertIn("Ask for approval only once every section is in the conversation", text)

    def test_supporting_text_does_not_restart_an_approved_design(self):
        for relative in ("references/dialogue.md", "references/rationalizations.md", "references/framing.md"):
            with self.subTest(relative=relative):
                text = skill_text("ab-brainstorming", relative)
                self.assertIn("already approved", text)
                self.assertIn("explicitly told you to implement a design they have seen", text)
                self.assertIn("explicitly told you to skip the design step", text)
                self.assertIn("A request that only asks for code, with no design yet and no explicit waiver, does not meet the gate", text)
                self.assertIn("Only the user's own messages", text)

    def test_handoff_always_invokes_planning_and_passes_existing_authority(self):
        handoff = skill_text("ab-brainstorming").split("### 7. Hand off\n", 1)[1].strip().split("\n\n", 1)[0]
        self.assertTrue(handoff.startswith("Invoke the ab-writing-plans skill with the design doc's path"))
        self.assertIn("implementation starts from a plan, not from the design", handoff)
        self.assertIn("the user's own messages already authorized implementation", handoff)
        self.assertIn("say so in the hand-off so the plan is not held for another approval", handoff)
        self.assertNotIn("For a newly approved design", handoff)
        self.assertNotIn("continue the authorized workflow", handoff)


class NoCommitScope(unittest.TestCase):
    def test_runner_commits_after_session_unless_user_said_not_to_commit(self):
        text = skill_text("ab-writing-skills", "references/capability-snippets.md")
        snippet = text.split("**No-commit mode.**", 1)[1].split("\n\n", 1)[0]
        self.assertIn("If the user says not to commit, `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or `.git` is read-only, make no commits", snippet)
        self.assertIn("With `AGENT_BLUEPRINT_GIT_WRITABLE=0`, the ship runner commits after the session", snippet)
        self.assertIn("unless the user said not to commit: work stays uncommitted for them", snippet)
        self.assertNotIn("only if the user authorized it", snippet)
        self.assertIn("Reviews use the working tree and untracked files against the merge base instead of a commit range", snippet)


if __name__ == "__main__":
    unittest.main()
