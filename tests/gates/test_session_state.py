"""U6: session notes live in docs/context/STATUS.md, working folders in .agent-blueprint/ (KTD6, KTD8)."""
import glob
import os
import re
import unittest

from gate_helpers import REPO

SKILLS = os.path.join(REPO, "skills")
# .claude/ paths a skill may still name: the host's own folders and the v3 install it migrates.
HOST_OWNED = ("skills", "agents", "commands", "hooks", "plugins", "settings.json", "settings.local.json")
CLAUDE_PATH = re.compile(r"\.claude/([A-Za-z0-9_.*<>{}-]+)")
WRITERS = ["ab-brainstorming", "ab-executing-plans", "ab-review-swarm", "ab-iterative-refinement",
           "ab-ship-pipeline", "ab-subagent-driven-development", "ab-systematic-debugging",
           "ab-team-execution", "ab-writing-skills", "ab-forensics", "ab-orchestrate"]


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def skill_text(name):
    """All markdown a skill carries outside assets/, concatenated."""
    paths = [p for p in glob.glob(os.path.join(SKILLS, name, "**", "*.md"), recursive=True) if "/assets/" not in p]
    return "\n".join(read(p) for p in sorted(paths))


class SessionState(unittest.TestCase):
    def test_no_skill_names_a_claude_working_folder(self):
        hits = []
        for path in glob.glob(os.path.join(SKILLS, "*", "**", "*.md"), recursive=True):
            if "/ab-writing-skills/examples/" in path:   # examples of host skill folders, not working folders
                continue
            for m in CLAUDE_PATH.finditer(read(path)):
                if not m.group(1).startswith(HOST_OWNED):
                    hits.append("%s: .claude/%s" % (os.path.relpath(path, REPO), m.group(1)))
        self.assertEqual(hits, [], "blueprint working folders belong under .agent-blueprint/ (KTD8)")

    def test_session_wrap_writes_no_html_comment(self):
        self.assertNotIn("<!--", skill_text("ab-session-wrap"))

    def test_session_notes_go_to_status_md(self):
        for name in ("ab-session-wrap", "ab-context-checkpoint", "ab-session-continuity"):
            text = skill_text(name)
            self.assertIn("docs/context/STATUS.md", text, name)
            self.assertIn("Session Continuity", text, name)

    def test_resume_reads_what_the_checkpoint_writes(self):
        resume = read(os.path.join(SKILLS, "ab-resume-session", "SKILL.md"))
        checkpoint = read(os.path.join(SKILLS, "ab-context-checkpoint", "SKILL.md"))
        self.assertIn("Session Continuity", resume)
        self.assertIn("docs/context/STATUS.md", resume)
        self.assertIn("Session Continuity section of `docs/context/STATUS.md`", checkpoint)
        self.assertNotIn("CLAUDE.md", checkpoint)

    def test_status_template_has_the_section(self):
        text = read(os.path.join(REPO, "templates", "docs", "context", "STATUS.md"))
        self.assertIn("## Session Continuity", text)
        self.assertIn("**Start here:**", text)
        self.assertNotIn("<!--", text)

    def test_run_state_reference_defines_the_contract(self):
        text = read(os.path.join(SKILLS, "ab-ship-pipeline", "references", "run-state.md"))
        for field in ("status", "stage", "iteration", "host", "driver", "session_id", "decisions",
                      "provenance", "reason", "updated_at"):
            self.assertIn("| `%s` |" % field, text, field)
        for value in ("`running`", "`done`", "`blocked`", "`needs-human`", "`runner`", "`interactive`"):
            self.assertIn(value, text)
        self.assertIn(".agent-blueprint/run/", text)
        self.assertIn("`pr-body.md`", text)
        self.assertIn("never publishes a path it read from `state.json`", text)
        self.assertIn("provenance/<skill>.json", text)
        self.assertIn("Never delete a run file", text)

    def test_agent_blueprint_gitignore(self):
        lines = read(os.path.join(REPO, "templates", ".agent-blueprint", ".gitignore")).split("\n")
        entries = [l.strip() for l in lines if l.strip() and not l.startswith("#")]
        for ignored in ("run/", "team/"):
            self.assertIn(ignored, entries)
        self.assertNotIn("plans/", entries)
        self.assertFalse(any(e.startswith(("plans", "*", "debug", "forensics")) for e in entries))

    def test_writer_skills_carry_the_working_folder_snippet(self):
        missing = [n for n in WRITERS if "**Working folder.**" not in skill_text(n)]
        self.assertEqual(missing, [])

    def test_learnings_step_resolves_the_instructions_file(self):
        text = read(os.path.join(SKILLS, "ab-knowledge-compounding", "SKILL.md"))
        self.assertIn("The file is AGENTS.md, or CLAUDE.md when only that one exists", text)


if __name__ == "__main__":
    unittest.main()
