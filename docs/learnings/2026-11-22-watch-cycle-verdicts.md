---
title: "Decision record: 2026-11-22 platform and pattern watch, shipped as 4.3.0"
date: 2026-11-22
category: gate-decision
cycle: watch-2026-11-22
applies_when:
  - A later platform watch re-flags a check this record settled (helper effort, fork subagents, Amp's model selector, the eve 1.x pin)
  - Someone proposes moving the pressure-test scenarios out of the skill tree, or reshaping ab-brainstorming's question rules
  - Someone proposes prompt changes for a newer model, or adding a model or effort to a skill
tags: [gate-decision, cli-watch, model-and-effort, fable-5-2, opus-5-5, review-swarm, prompt-audit, deferrals]
---

# 2026-11-22 watch cycle: fail-closed checks, fresh helpers, current model notes

The first cycle that covered all eight CLIs, the hosted runtime and a set of outside skill collections at once, run
from the maintainer's watch tooling (window 2026-09-27 for the CLIs, 2026-09-10 for the collections). The earlier
records are [the 2026-09-27 cycle](2026-09-27-cli-watch-cycle-verdicts.md) and
[the 2026-09-11 cycle](2026-09-11-cli-watch-cycle-verdicts.md). Every idea below is stated in the blueprint's own
terms. Outcome: no skill added, renamed or removed; counts stay 53 / 30 / 10; no public contract changed.

## Standing checks

| Check | Outcome | Evidence |
|---|---|---|
| a, b, c, e, f | HOLDS at Claude Code 2.1.330 | release notes 2.1.284 to 2.1.330 |
| d model lineup and effort | CHANGED | Fable 5.2, Opus 5.5, Sonnet 5.5 and Haiku 5.5 start at `medium`; the Agent tool takes a per-helper `effort` (2.1.292); `CLAUDE_CODE_SUBAGENT_EFFORT` (2.1.316); a helper on another model uses that model's level (2.1.317) |
| g plugin validator | HOLDS | `claude plugin validate --strict --json` on the plugin and its marketplace, 2.1.330 |
| S1 to S6 | KEEP / no change | none of their reopen triggers fired |

## Adopted (4.3.0)

- **A reviewer that never reported is not a clean pass.** Reviewers return `reviewed` and `files_read`; a missing,
  malformed or not-reviewed return is started once more, then listed under "Not reviewed" (its findings are still
  validated), and the refinement loop cannot converge on that round. Reason: an empty findings list from a reviewer that crashed read as a clean review.
- **Reviews read the code they name.** A commit-range review checks that `HEAD` is the reviewed head and that no file
  in the range has uncommitted edits (a plan's ticks elsewhere may stay); a session reviewing its own work commits its
  known fixes first, and nothing is edited while the reviewers read.
- **Checks fail closed.** The integration verifier's verdict must agree with its own issue lists, and zero tests run
  is "nothing verified"; a plan's check must change with its task (or be a marked guard); the autonomous loop never
  ticks a task without a usable check on a green suite alone.
- **Helpers start fresh and are waited for**, written into the Helper step snippet without making it longer. Reason:
  hosts began forking subagents by default in headless runs, which hands a helper the whole conversation.
- **Hooks:** the context monitor skips calls whose input carries an `agent_id` (a helper's), and session start names a
  ship run that stopped `blocked` or `needs-human` and a state file that no longer parses.
- **Reports put the gaps first** (not done, not verified, changed outside the plan), and the ship and loop reports open
  with a paragraph for a reader who saw none of the run.
- **Knowledge:** solution docs cite code by file and name, a gardening pass marks a doc it cannot confirm as
  unverified (a mark, not an edit, so no consent is needed), the learnings researcher discounts such a doc, and a
  rule-shaped lesson proposes a test or convention first.
- **Smaller rules:** a pull-request watch that skips automated findings on replaced commits and keeps people's comments; credit kept for
  continued work; ship authorization covers the verification its plan needs; implementers stage their task's files
  by name; a mutation check confirms the break landed; a blocked task no longer stops independent ones in
  subagent-driven development; brainstorming records the approaches weighed.
- **Authoring:** the references state rules with reasons instead of capitalized absolutes, test with more than one
  vendor's models, check that moved rules survived, and add two rules: no step exists for one model, and never edit a
  skill inside a host's installed copy.
- **Gates:** frontmatter value shapes (`compatibility`, `allowed-tools`, `metadata`), no positional `$0`, `$1`, `$10` in
  SKILL.md, and a skill that names a bundled script must carry the Bundled scripts snippet; `find-polluter.sh` refuses
  to run inside its own skill folder.
- **Model and effort notes** for Claude Code, Codex and Amp (README and host notes). No skill picks a model or effort.

## Prompt audit, bounded

The skill corpus was audited against the current Claude models' published prompting guidance. This partly supersedes
D3 of the 2026-09-11 and 2026-09-27 records, which kept the prompt-audit sweep for its own review-first session: the
maintainer asked for the model findings to be implemented in this cycle, so only the audit's high- and
medium-confidence hunks with a portable basis or harmless wording were applied, and the pull request is the review.
Left for that session: lines that invite delegation, the verification-before-completion register, and
ab-executing-plans' stop list, which disagrees with its own deviations reference on a missing dependency (the fix
would loosen a stop rule).

## Deferred, not rejected

| Item | Why | Revisit when |
|---|---|---|
| Move the pressure-test scenarios out of `skills/` | the path-escape gate forbids pointing outside a skill, and `tests/` does not ship | a host's scan starts flagging them |
| Reshape ab-brainstorming's questions (an open "why", process calls stated) | it narrows the skill's own stated rule on outside evidence | the brainstorm smoke cell can measure it |
| The orchestrator's completeness principle | a scoping stance, not a dated pattern | the maintainer rules on it |
| Token budget stop for the ship runner | a new runner flag and run-state field: a public contract | the maintainer asks for it |
| eve 1.x | a major upgrade with package, compaction-key, `edit_file` guard and Postgres bootstrap changes, and Docker-backed evals | its own sprint |
| Hosted roster ids (a newer reviewer model, Fable 5.2 for a role) | changes the hosted defaults and cost; needs the roster evals | with eve 1.x |
| A measured retune of the skills for new models (a no-plugin arm and a same-build noise floor in the eval harness) | real tokens on the maintainer machine | the next eval plan |
| Antigravity Auto-mode headless posture, Grok `--plugin-dir`, Pi `auth check`, Hermes `-z` exit codes | installed versions predate the change, or the tool is not installed | the next smoke run of that host |
