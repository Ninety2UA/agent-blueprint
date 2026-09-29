---
name: ab-ideation
description: "Generates grounded improvement ideas for a project: scans its learnings, structure and git history with three helpers, generates candidates from three frames (friction, inversion, leverage), rejects the weak ones with a reason each, and saves 5-7 ranked survivors to docs/research/. Use when the user asks what to build, change or improve next, wants ideas, feels stuck or unsure where to focus, or starts a session with no clear goal. Not for designing something the user already chose (ab-brainstorming) or researching a named topic (ab-deep-research)."
argument-hint: "[optional: focus area, constraint, or volume hint]"
---

# Generate Improvement Ideas

The outcome is a ranked ideation doc in `docs/research/`: 5-7 surviving ideas, each grounded in this codebase, and a rejection summary saying why the rest fell. It answers "What are the strongest ideas worth exploring?" and writes no requirements, plans or code. Quality comes from grounding and explicit rejection, not optimistic ranking, and the user picks which idea goes on to the ab-brainstorming skill.

Not for: designing what the user already chose (the ab-brainstorming skill); researching one named topic (ab-deep-research); breaking a known feature into tasks (ab-writing-plans); choosing between two named options (ab-discuss), since ideation is for "I don't know what to do"; or ranking existing bug reports (ab-backlog-triage).

## Focus hint

Read the focus hint, if any, from the user's request that came with this skill: a concept (`DX improvements`), a path (`src/api/`), a constraint (`low-complexity quick wins`) or a volume hint (`top 3`, `go deep`, `raise the bar`). With none, ideate open-ended.

Default volume: about 8-10 ideas per helper (about 25 raw, 15-20 after dedupe), keeping 5-7 survivors. Honor a clear override.

## Phase 0: Resume and scope

Parse the focus hint into focus context and a volume override. Look in `docs/research/` for ideation docs (`*-ideation.md`) from the last 30 days; if one matches this topic or focus, ask how to proceed.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: continue from it (read, summarize, update it in place), or start fresh. Default when nobody answers: continue from it, so its survivors and rejections are not lost.

## Phase 1: Codebase scan

Start three helpers in parallel and wait for all of them, because the later phases build on their results.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt files and inputs (each also gets the focus hint):
- `references/agents/learnings-researcher.md`: known pain points, recurring issues and areas flagged for improvement in docs/solutions/, docs/learnings/ and docs/context/DECISIONS.md.
- `references/agents/codebase-context-mapper.md`: project structure, patterns, conventions and gaps, such as high complexity, missing tests or unclear architecture.
- `references/agents/git-history-analyzer.md`: the last 30 days of history: hot files, recurring fix patterns, frequent churn, and recent refactors that may need follow-up.

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

Consolidate the results into a grounding summary: **project shape** (language, framework, structure, key patterns), **known pain points** (learnings, past solutions), **hot spots** (git churn) and **gaps** (missing tests, unclear docs, incomplete features).

## Phase 2: Divergent ideation

Generate the full candidate list before critiquing any idea, because early critique prunes the list before strong combinations can appear.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompts: the three frames in `references/ideation-frames.md` (friction, inversion, leverage), one per helper; they have no prompt file. Inputs: the grounding summary, the focus hint and a volume of about 8-10 ideas. Start all three at once, since they are independent. A frame is a starting bias, not a constraint, and helpers return raw candidates only, with no critique.

When all have returned:
1. Merge and dedupe into one master list.
2. Combine ideas from different frames into something stronger where you can (expect 2-4 additions).
3. With a focus, weight toward it without excluding stronger adjacent ideas.

## Phase 3: Adversarial filtering

Review every candidate yourself rather than handing critique to helpers, because judging an idea means comparing it with the whole list. Give each rejected idea a one-line reason.

Apply `references/filtering.md` in order: reject by its criteria, score the survivors, and tag each as a two-way or one-way door, scrutinizing one-way doors harder.

Keep 5-7 survivors. If more survive, run a stricter pass; if fewer than 5, say so honestly rather than lowering the bar.

## Phase 4: Present survivors

Present the survivors, then the rejection summary table, in the format in `references/ideation-formats.md` § Presenting survivors. The rejections show what was considered, so the ranking does not look arbitrary.

## Phase 5: Hand off

Write or update the ideation doc (`references/ideation-formats.md` § Ideation doc) before any hand-off, before ending the session and after each refinement round, so no round's work lives only in the conversation. Then ask what happens next.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: (1) take a chosen idea forward: mark it `Explored` in the doc, then invoke the ab-brainstorming skill with the idea as its seed, since a chosen idea still needs a design before a plan; (2) refine: add angles (back to Phase 2), raise the bar (back to Phase 3) or dig into one idea; (3) end the session and commit the doc, unless the user would rather leave it uncommitted. Default when nobody answers: (3), because choosing which idea to pursue is the user's call.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

Commit message: `docs: ideation — <topic>`.

The principles behind these phases, and why skipping one fails: `references/rationalizations.md`.
