---
name: ab-writing-skills
description: "Trigger this skill when creating, editing, or testing skills — even if the user just wants to tweak frontmatter. Trigger when the user says 'create a skill', 'write a skill', 'edit skill', 'skill frontmatter', 'improve skill description', 'test a skill', 'new skill', 'skill template', 'how do I write a skill', 'skill format', or 'eval a skill'. Covers frontmatter format, progressive disclosure structure, description writing best practices, and testing skills with subagents using TDD (red-green-refactor). DO NOT TRIGGER for creating Claude Code plugins — use plugin-structure instead. DO NOT TRIGGER for writing agents — use agent-development instead."
---

# Writing Skills

## Overview

**Writing skills IS Test-Driven Development applied to process documentation.**

**Personal skills live in agent-specific directories (`~/.claude/skills` for Claude Code, `~/.agents/skills/` for Codex)**

You write test cases (pressure scenarios with subagents), watch them fail (baseline behavior), write the skill (documentation), watch tests pass (agents comply), and refactor (close loopholes).

**Core principle:** If you didn't watch an agent fail without the skill, you don't know if the skill teaches the right thing.

**REQUIRED BACKGROUND:** You MUST understand ab-test-driven-development before using this skill. That skill defines the fundamental RED-GREEN-REFACTOR cycle. This skill adapts TDD to documentation.

**Official guidance:** For Anthropic's official skill authoring best practices, see anthropic-best-practices.md. This document provides additional patterns and guidelines that complement the TDD-focused approach in this skill.

## What is a Skill?

A **skill** is a reference guide for proven techniques, patterns, or tools. Skills help future Claude instances find and apply effective approaches.

**Skills are:** Reusable techniques, patterns, tools, reference guides

**Skills are NOT:** Narratives about how you solved a problem once

## TDD Mapping for Skills

| TDD Concept | Skill Creation |
|-------------|----------------|
| **Test case** | Pressure scenario with subagent |
| **Production code** | Skill document (SKILL.md) |
| **Test fails (RED)** | Agent violates rule without skill (baseline) |
| **Test passes (GREEN)** | Agent complies with skill present |
| **Refactor** | Close loopholes while maintaining compliance |
| **Write test first** | Run baseline scenario BEFORE writing skill |
| **Watch it fail** | Document exact rationalizations agent uses |
| **Minimal code** | Write skill addressing those specific violations |
| **Watch it pass** | Verify agent now complies |
| **Refactor cycle** | Find new rationalizations → plug → re-verify |

The entire skill creation process follows RED-GREEN-REFACTOR.

## When to Create a Skill

**Create when:**
- Technique wasn't intuitively obvious to you
- You'd reference this again across projects
- Pattern applies broadly (not project-specific)
- Others would benefit

**Don't create for:**
- One-off solutions
- Standard practices well-documented elsewhere
- Project-specific conventions (put in CLAUDE.md)
- Mechanical constraints (if it's enforceable with regex/validation, automate it—save documentation for judgment calls)

## Skill Types

### Technique
Concrete method with steps to follow (condition-based-waiting, root-cause-tracing)

### Pattern
Way of thinking about problems (flatten-with-flags, test-invariants)

### Reference
API docs, syntax guides, tool documentation (office docs)

## Directory Structure

Flat namespace: one `SKILL.md` per skill, supporting files only for heavy reference (100+ lines) or reusable tools; principles, concepts, and short code patterns stay inline. Layouts in `references/skill-architecture.md` § Directory Structure.

## SKILL.md Structure

**Frontmatter (YAML):**
- Required fields (the portable Skill standard): `name` and `description`
- Optional (Claude Code extension): `allowed-tools` / `disallowed-tools` (CLI 2.1.152+) scope which tools the skill may use while active — omit unless you need to restrict tool exposure; they are ignored by runtimes that only honor the portable core
- Max 1024 characters total
- `name`: Use letters, numbers, and hyphens only (no parentheses, special chars)
- `description`: Third-person, describes ONLY when to use (NOT what it does)
  - Start with "Use when..." to focus on triggering conditions
  - Include specific symptoms, situations, and contexts
  - **NEVER summarize the skill's process or workflow** (see CSO section for why)
  - Keep under 500 characters if possible
  - **Stay distinguishable from sibling skills.** A description that overlaps another skill's triggering conditions causes prompts to route ambiguously between them — a failure a single-skill trigger test cannot catch. Name the conditions that are *unique* to this skill. `scripts/check-skill-collisions.py` (wired into CI) flags near-duplicate descriptions: it warns at ≥50% content-token overlap (Jaccard) and fails at ≥75%. If it flags a pair, narrow one description's trigger conditions rather than widening both.

The full section skeleton — Overview, When to Use, When NOT to Use (required), Core Pattern, Quick Reference, Implementation, Common Mistakes, Common Rationalizations (required for discipline skills), Real-World Impact — and why the two required sections exist: `references/skill-template.md`.

## Claude Search Optimization (CSO)

**Critical for discovery:** Future Claude needs to FIND your skill

### 1. Rich Description Field

**Purpose:** Claude reads description to decide which skills to load for a given task. Make it answer: "Should I read this skill right now?"

**Format:** Start with "Use when..." to focus on triggering conditions

**CRITICAL: Description = When to Use, NOT What the Skill Does.** A description that summarizes the workflow becomes a shortcut Claude follows instead of reading the skill (observed: a two-review flowchart collapsed to one review). Evidence and bad/good examples: `references/cso-examples.md` § Description = when, not what.

**Content:**
- Use concrete triggers, symptoms, and situations that signal this skill applies
- Describe the *problem* (race conditions, inconsistent behavior) not *language-specific symptoms* (setTimeout, sleep)
- Keep triggers technology-agnostic unless the skill itself is technology-specific
- If skill is technology-specific, make that explicit in the trigger
- Write in third person (injected into system prompt)
- **NEVER summarize the skill's process or workflow**

Examples of bad and good descriptions: `references/cso-examples.md` § Description examples.

### 2. Keyword Coverage

Use words Claude would search for:
- Error messages: "Hook timed out", "ENOTEMPTY", "race condition"
- Symptoms: "flaky", "hanging", "zombie", "pollution"
- Synonyms: "timeout/hang/freeze", "cleanup/teardown/afterEach"
- Tools: Actual commands, library names, file types

### 3. Descriptive Naming

**Use active voice, verb-first:**
- ✅ `creating-skills` not `skill-creation`
- ✅ `condition-based-waiting` not `async-test-helpers`

### 4. Token Efficiency (Critical)

**Problem:** SKILL.md is the always-loaded file — every skill pays its byte cost the moment it triggers, not just getting-started and frequently-loaded skills.

**Target: an 8,192-byte body.** Keep everything after the frontmatter under 8,192 bytes. Phase-by-phase procedures, exhaustive flag lists, and worked examples belong in `references/` files the skill loads on demand — not inlined in the always-loaded body. Savings come from structure (moving detail out, cross-referencing, one example per pattern), not from squeezing sentences into fewer words.

`scripts/check-skill-collisions.py` runs a warn-only size report over every SKILL.md: a WARN at 8,192 bytes, a second-tier WARN at 16,384 bytes. It never fails the gate. On a WARN, move phase procedures to `references/` — don't respond by squeezing the remaining sentences tighter.

**Techniques** — move details to tool help, cross-reference instead of repeating, one compressed example per pattern, eliminate redundancy — with before/after examples, the `wc -c` check, and naming guidance (name by what you do or the core insight; gerunds for processes): `references/cso-examples.md` § Token-efficiency techniques and naming.

### 4. Cross-Referencing Other Skills

**When writing documentation that references other skills:**

Use skill name only, with explicit requirement markers:
- ✅ Good: `**REQUIRED SUB-SKILL:** Use ab-test-driven-development`
- ✅ Good: `**REQUIRED BACKGROUND:** You MUST understand ab-systematic-debugging`
- ❌ Bad: `See skills/testing/test-driven-development` (unclear if required)
- ❌ Bad: `@skills/testing/test-driven-development/SKILL.md` (force-loads, burns context)

**Why no @ links:** `@` syntax force-loads files immediately, consuming 200k+ context before you need them.

## Load-Bearing Rules Belong Inline (Not in References)

**SKILL.md is always loaded; references load on demand.** An agent that renders past a "Load `references/X.md` now" instruction on the way to a later phase has no per-option routing in its context — the menu becomes a textual handoff with no associated action.

**The test:** Could an agent that skips the reference still complete the skill correctly? If no — if the agent without the reference would stop, guess, or render a menu without firing the routed action — the missing content is **load-bearing** and belongs inline.

Rules of thumb (per-option menu routing and always-executed steps stay inline; conditional sub-flows and heavy material go to references) and the authoring checklist to run before extracting any block: `references/skill-architecture.md` § Load-bearing rules of thumb.

**Platform-explicit invocation language:** when a routing line says "Call `/foo`", name the platform primitive (the Skill tool in Claude Code) and the argument shape so it cannot be read as "tell the user to type"; example in `references/cso-examples.md` § Platform-explicit invocation language.

## Flowcharts, Examples, Scripts, File Organization

`references/skill-architecture.md` owns: when a flowchart earns its place (non-obvious decisions, loops you might exit early) and the graphviz rules; one excellent example over many; script-first architecture for skills that process large datasets (the script does all mechanical work, SKILL.md presents; Python over bash for multi-step scripts); and the three file layouts (self-contained, reusable tool, heavy reference).

## The Iron Law (Same as TDD)

```
NO SKILL WITHOUT A FAILING TEST FIRST
```

This applies to NEW skills AND EDITS to existing skills.

Write skill before testing? Delete it. Start over.
Edit skill without testing? Same violation.

**No exceptions:**
- Not for "simple additions"
- Not for "just adding a section"
- Not for "documentation updates"
- Don't keep untested changes as "reference"
- Don't "adapt" while running tests
- Delete means delete

**REQUIRED BACKGROUND:** The ab-test-driven-development skill explains why this matters. Same principles apply to documentation.

## Testing All Skill Types

Discipline, technique, pattern, and reference skills each need a different test shape and success criterion — see `references/testing-and-bulletproofing.md` § Testing All Skill Types.

## Common Rationalizations for Skipping Testing

| Excuse | Reality |
|--------|---------|
| "Skill is obviously clear" | Clear to you ≠ clear to other agents. Test it. |
| "It's just a reference" | References can have gaps, unclear sections. Test retrieval. |
| "Testing is overkill" | Untested skills have issues. Always. 15 min testing saves hours. |
| "I'll test if problems emerge" | Problems = agents can't use skill. Test BEFORE deploying. |
| "Too tedious to test" | Testing is less tedious than debugging bad skill in production. |
| "I'm confident it's good" | Overconfidence guarantees issues. Test anyway. |
| "Academic review is enough" | Reading ≠ using. Test application scenarios. |
| "No time to test" | Deploying untested skill wastes more time fixing it later. |

**All of these mean: Test before deploying. No exceptions.**

## Bulletproofing Skills Against Rationalization

Discipline skills must resist rationalization under pressure: close every loophole explicitly, add the letter-versus-spirit principle early, build the rationalization table from baseline runs, keep a red-flags list, and put violation symptoms in the description. Worked examples and the persuasion research behind them: `references/testing-and-bulletproofing.md` § Bulletproofing Skills Against Rationalization.

## RED-GREEN-REFACTOR for Skills

Follow the TDD cycle:

### RED: Write Failing Test (Baseline)

Run pressure scenario with subagent WITHOUT the skill. Document exact behavior:
- What choices did they make?
- What rationalizations did they use (verbatim)?
- Which pressures triggered violations?

This is "watch the test fail" - you must see what agents naturally do before writing the skill.

### GREEN: Write Minimal Skill

Write skill that addresses those specific rationalizations. Don't add extra content for hypothetical cases.

Run same scenarios WITH skill. Agent should now comply.

### REFACTOR: Close Loopholes

Agent found new rationalization? Add explicit counter. Re-test until bulletproof.

**Testing methodology:** See @testing-skills-with-subagents.md for the complete testing methodology:
- How to write pressure scenarios
- Pressure types (time, sunk cost, authority, exhaustion)
- Plugging holes systematically
- Meta-testing techniques

To measure trigger reliability with the platform's own isolated runner, `claude plugin eval` (billed; format and caveats in `references/testing-and-bulletproofing.md` § Native runner).

## Iteration Strategy by Skill Type

Discipline skills: close loopholes one by one. Technique and pattern skills: reframe with a different metaphor instead of adding rules. Reference skills: iterate on organization, not content. Detail: `references/testing-and-bulletproofing.md` § Iteration Strategy by Skill Type.

## Anti-Patterns

Narrative examples, multi-language dilution, code inside flowcharts, generic labels — each with why it fails: `references/skill-architecture.md` § Anti-Patterns.

## STOP: Before Moving to Next Skill

**After writing ANY skill, you MUST STOP and complete the deployment process.**

**Do NOT:**
- Create multiple skills in batch without testing each
- Move to next skill before current one is verified
- Skip testing because "batching is more efficient"

**The deployment checklist below is MANDATORY for EACH skill.**

Deploying untested skills = deploying untested code. It's a violation of quality standards.

## Skill Creation Checklist (TDD Adapted)

**IMPORTANT: Track EACH checklist item below in a progress file and tick it as you complete it.**

**Progress file — `.claude/plans/<skill-name>-skill.progress.local.md`:**

- First line names the skill; one checkbox per checklist item.
- If the file already exists, reuse it and its ticks instead of recreating it.
- At creation, run `git check-ignore -q` on it; if that fails, append `.claude/plans/*.progress.local.md` to the file named by `git rev-parse --git-path info/exclude`.
- Delete it when every box is ticked and the skill's final test run is clean.
- An interrupted run leaves it in place; the STATE.md handoff (ab-session-continuity) points at it.
- The session's native task list is the alternative only when the model offers one: Claude Code exposes its native task-list tools only on Claude 3.x, Opus 4.0–4.7, Sonnet 4.0–4.6 and Haiku 4.5 (CLI 2.1.233; verified on 2.1.268); `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` restores them elsewhere.

The checklist items — RED (pressure scenarios, baseline run, rationalization patterns), GREEN (name and frontmatter rules, description form, keywords, overview, baseline failures addressed, one example, compliance run), REFACTOR (new rationalizations, counters, table, red flags, re-test), Quality Checks, and Deployment — are in `references/skill-template.md` § Skill Creation Checklist. Copy them into the progress file as its checkboxes.

## Discovery Workflow

Future Claude finds a skill by problem → description match → overview scan → quick reference → example on demand; put searchable terms early and often (`references/cso-examples.md` § Discovery Workflow).

## The Bottom Line

**Creating skills IS TDD for process documentation.**

Same Iron Law: No skill without failing test first.
Same cycle: RED (baseline) → GREEN (write skill) → REFACTOR (close loopholes).
Same benefits: Better quality, fewer surprises, bulletproof results.

If you follow TDD for code, follow it for skills. It's the same discipline applied to documentation.
