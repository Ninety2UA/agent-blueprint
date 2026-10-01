---
name: ab-brainstorming
description: "Turns an idea into an approved design before any code is written: settles what the repository answers, challenges the premise, asks the remaining questions one at a time, compares two or three approaches, presents the design in sections for approval, then saves it and hands off to ab-writing-plans. Use when the user wants to brainstorm or design a change, or when work involves design decisions, several viable approaches or three or more files, including when the user jumps straight to code on such work. Not for a trivial change under three files with one obvious approach (ab-quick-fix), or for recording decisions without exploring alternatives (ab-discuss)."
metadata:
  version: "4.0.0"
---

# Brainstorming Ideas Into Designs

The outcome is a design the user approved, saved as `docs/plans/YYYY-MM-DD-<topic>-design.md`, and a handoff to the ab-writing-plans skill.

**Hard gate.** Start nothing that implements (no implementation skill, code or scaffolding) until a design has been presented and approved, however simple the project looks: simple projects are where unexamined assumptions waste the most work. Approving the design approves the scope only; the plan the ab-writing-plans skill saves is reviewed before anything executes. Stay in the normal conversation rather than a host's own plan mode (such as Claude Code's), because this skill is the planning process.

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`, so run state and the ignore file itself stay out of commits while plans and notes stay tracked.

**Provenance record.** When this skill starts, write `.agent-blueprint/run/provenance/<name>.json`, where `<name>` is the `name` in this skill's frontmatter: `skill` (that name), `version` (its `metadata.version`), `started_at` (the current UTC time, ISO 8601) and an empty `helper_steps` list, replacing any older record of that name. Before that, make sure `.agent-blueprint/.gitignore` exists and lists `run/`, `team/`, `review-runs/`, `cache/` and `.gitignore`. Each Helper step adds `{step, path: helper|inline}` to `helper_steps`. The record tells a run, and the smoke test, which skill ran and how; it is not a security control.

## Size the ceremony

- **Spike**: an exploratory probe with no fixed destination yet (a timeboxed look at what is there, a throwaway prototype that answers one question). Skip brainstorming: probe, then decide whether what you learned needs a design.
- **Bounded**: a bug fix with an obvious root cause touching under three files, a typo, or a test for existing behavior. Skip brainstorming and go straight to TDD.
- **Architectural**: everything else, including any change touching three or more files or with more than one viable approach. Run every step below; the design may be a few sentences, but it is presented and approved.

When in doubt, treat it as architectural: a two-minute design review costs less than rework. Why "too simple" is no exemption: `references/rationalizations.md`.

## Steps

**Tracking tasks.** The plan file's checkboxes are the record of progress: tick each one when its task is done and verified, so another session or another tool can continue from there. A host task list, if you have one, may mirror them, but it never replaces them.

Here the checkboxes live in `.agent-blueprint/plans/<topic-slug>.progress.md`: create it with one per step below.

### 1. Explore the project context

Read the relevant files, docs and recent commits, and settle from them whatever they answer, so the user is not asked what the repository already says.

### 2. Frame the problem

Work through `references/framing.md` in order: the fog test (if you cannot yet state the destination in one sentence or name the first three decisions, narrow it or run a spike first), the premise challenge, the blindspot pass when the user is in unfamiliar territory, and a scope mode inferred from context, stated, then held.

### 3. Ask clarifying questions

WHY first (the problem and who has it), then constraints and success criteria. One question per message, multiple choice where you can; the one exception is a single batch of the genuinely residual questions left after settling. A better framing from step 2 goes to the user here. Then write your understanding back in a few lines, separating what the user said from what you assume, so a wrong assumption is caught before the design rests on it.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: the likely answers, your recommendation first. Default when nobody answers: take the recommended answer, record it as an explicit assumption for the design doc, and continue.

### 4. Propose approaches

Propose two or three approaches with their trade-offs, leading with the one you recommend and why: a single option is a recommendation disguised as a decision. Cut features the design does not need (YAGNI).

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: the approaches, at most three. Default when nobody answers: the recommended approach, logged as a decision.

### 5. Present the design

Present the chosen approach's design in sections (architecture, components, data flow, error handling, testing), each scaled to its complexity: a few sentences, up to 200-300 words when nuanced. After each section ask whether it looks right, and go back to clarify when something does not fit.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: approve, revise (say what), or return to step 4. Default when nobody answers: approve the design as presented and log it as a decision. This is the hard gate's unattended path; the plan is still checked before anything executes.

### 6. Write and commit the design doc

Write the approved design to `docs/plans/YYYY-MM-DD-<topic>-design.md` with the assumptions and defaults you took, using a clear-writing skill such as elements-of-style:writing-clearly-and-concisely if one is available. Commit it.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

### 7. Hand off

Invoke the ab-writing-plans skill with the design doc's path. This is the terminal state: the only skill you invoke after brainstorming is ab-writing-plans, because implementation starts from a reviewed plan, not from the design.

The flow as a diagram, and the principles behind these steps: `references/dialogue.md`.
