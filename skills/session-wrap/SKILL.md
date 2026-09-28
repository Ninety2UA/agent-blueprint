---
name: session-wrap
description: "Trigger this skill when the user says 'wrap', 'wrap up', 'end session', 'done for today', 'finishing up', 'let's stop here', 'save everything', 'I'm done', 'that's it for now', 'calling it a day', 'log off', or anything suggesting they are ending a work session. Trigger at the end of ANY work session, even if the user just says 'I'm done' or 'gotta go' without explicitly asking for a wrap-up. Always suggest running this before ending a session if the user hasn't invoked it — session continuity depends on it. Summarizes accomplishments, records learnings, and updates all project documentation (CLAUDE.md, STATUS.md, GOALS.md, BACKLOG.md, LEARNINGS.md) to ensure the next session can pick up seamlessly. DO NOT TRIGGER for quick mid-session checkpoints or brief pauses — use pause-checkpoint instead. Session-wrap is the comprehensive end-of-session operation; pause-checkpoint is the lightweight mid-session alternative."
argument-hint: "[optional: focus area]"
---

# Session Wrap-Up

Summarize what was accomplished, record what was learned, and update every project document that was affected. The goal: the next session — whether it's you, a different agent, or a human — can pick up exactly where this one left off by reading the Session Continuity section in CLAUDE.md.

<HARD-GATE>
Do NOT modify source code, tests, or infrastructure files. This is a documentation-only operation. If you discover something that needs a code change, add it to BACKLOG.md instead.
</HARD-GATE>

## Step 1: Gather Context

Read ALL of these before writing anything. Do as many in parallel as possible.

**Project state files (read all):**
- `CLAUDE.md` — Session Continuity section, behavioral rules
- `docs/learnings/LEARNINGS.md` — key learnings and gotchas
- `docs/context/STATUS.md` — in flight, up next, what's done, known issues
- `docs/context/GOALS.md` — current objectives, milestones, non-goals
- `docs/context/CONVENTIONS.md` — tech stack, patterns, boundaries (check if new patterns emerged)
- `BACKLOG.md` — inbox, triaged, parked items

**Documentation files (check which exist):**
- `docs/plans/*.md` — any active implementation plans
- `docs/decisions/*.md` — any architecture decision records
- `docs/specs/*.md` — any feature specs
- `docs/research/*.md` — any research docs

**Git state (run all in parallel):** the command set in `references/templates.md` § Step 1 git state — recent commits, uncommitted changes, diff summary, session-window commits and files added or deleted, current branch, and test and build status when those commands are known.

**Auto-memory (if it exists):**
```bash
find ~/.claude -name "MEMORY.md" -path "*$(basename $(pwd))*" 2>/dev/null
```

## Step 1.5: Classify Session Type

Before analyzing, classify the session based on git history from Step 1:

**Planning session** — only plan files (`docs/plans/`), research docs (`docs/research/`), design docs, decision records (`docs/decisions/`), or ideation artifacts were created/modified. No source code, tests, or infrastructure changes in the diff.

**Implementation session** — source code, tests, configs, or infrastructure files were modified (anything outside `docs/` and project state files).

Determine this by checking: `git log --diff-filter=AM --name-only --since="8 hours ago" --format="" | grep -v -E '^(docs/|CLAUDE\.md|BACKLOG\.md|blueprint\.local\.md)'`

If the result is empty → **planning session**. If it has files → **implementation session**.

<HARD-GATE>
**If planning session:** Do NOT mark goals, milestones, or tasks as "completed" or "done" anywhere. A plan is not delivery. Specifically:
- Step 4 (CLAUDE.md): "What was done" should say "planned [feature]" or "wrote plan for [feature]" — NOT "implemented" or "built"
- Step 4 (CLAUDE.md): "Start here" should say "execute the plan at docs/plans/..." — NOT "continue implementing"
- Step 6 (STATUS.md): Add plan to "In Flight" or "Up Next" — do NOT move anything to "What's Done"
- Step 8 (GOALS.md): Do NOT mark goals/milestones as complete — at most note "plan written for [goal]"
- Step 10 (Plans): Do NOT mark the plan as COMPLETE — it hasn't been executed yet
- Skip Step 7 (CONVENTIONS.md) and Step 11 (Specs) — planning doesn't change conventions or specs
</HARD-GATE>

**If implementation session:** proceed with all steps as normal.

## Step 2: Analyze Session Work

Before writing anything, build a complete mental model:

1. **What changed?** — Map every git commit and uncommitted change. Include files added, modified, deleted, renamed. Note new dependencies added.
2. **What decisions were made?** — Architectural choices, technology selections, pattern adoptions, approaches rejected. Look beyond commits — file structure changes, new directories, config changes all signal decisions.
3. **What was learned?** — Pitfalls discovered, debugging dead ends, things that worked unexpectedly well or poorly, workarounds needed, documentation that was misleading.
4. **What broke or was surprising?** — Edge cases found, assumptions that were wrong, regressions introduced and fixed, unexpected behaviors.
5. **What's unfinished?** — Work started but not completed, tests that need writing, refactors deferred, TODO comments added.
6. **What's the state of the code right now?** — Does it build? Do tests pass? How many tests pass/fail? Are there uncommitted changes? Is the working tree clean?
7. **Goal alignment** — Cross-reference completed work against GOALS.md objectives and milestones. Did this session advance current goals? Did scope creep happen? Should any goals be updated?

## Step 3: Present Summary to User

Present a structured summary. Be specific — include file paths, commit hashes, numbers.

Present the structured summary in `references/templates.md` § Step 3 summary: Session Summary, Changes Made, Decisions Made, Learnings, Current State, Remaining Work, Goal Alignment.

Ask the user: **"Does this look accurate? Anything to add or correct before I update the docs?"**

**Wait for confirmation before proceeding.** The user may have context not in the git history — verbal decisions, Slack conversations, things they want emphasized or omitted.

## Step 4: Update CLAUDE.md — Session Continuity

Update the **Session Continuity** section at the top of CLAUDE.md. This is what the next session reads first.

Use the template in `references/templates.md` § Step 4 Session Continuity template.

**Rules:**
- Be specific enough that a new agent can start immediately without re-reading everything
- Include file paths and test names
- If there are failing tests, list them by name
- "Start here" should be a single actionable instruction, not a list
- Remaining Work ends on a closable next action: something the reader can start now (a file to open, a command to run, a failing test to fix), never a topic such as "look into auth"
- **Never summarize summaries.** Regenerate this section from actual project state (git log, test results, file system), not from the previous Session Continuity content. Summaries drift from reality like a photocopy of a photocopy — each compression loses information. The codebase and git history are the lossless source of truth; always reconcile against them.

## Step 5: Update docs/learnings/LEARNINGS.md

This step always runs. Every session evaluates whether a learning qualifies — even when the answer is no, that evaluation still happens and gets reported.

Append new entries to `docs/learnings/LEARNINGS.md` (create the file if it doesn't exist):

```markdown
### YYYY-MM-DD: [Brief title of learning]
[What was learned and why it matters. Include specific details — file paths, error messages, version numbers — that will help future sessions avoid the same pitfall or replicate the same success. Link to ADRs if relevant.]
```

**Rules:**
- Only add learnings that will matter in future sessions — not every commit needs an entry
- Keep each entry to 2-4 sentences but be specific (include file paths, commands, error messages)
- If a learning invalidates a previous entry, update the previous entry rather than adding a contradictory new one
- If a new learning contradicts or supersedes an existing entry, also run the knowledge-compounding skill's Gardening Checklist over the affected entries and any docs/solutions/ pages they cite before wrapping
- If conventions or patterns were established, ALSO update docs/context/CONVENTIONS.md (Step 7)
- If nothing this session clears the bar, add nothing to LEARNINGS.md — instead state "No durable learnings this session" in the Step 17 confirmation report. That sentence belongs in the report only; never append it to LEARNINGS.md itself

## Step 6: Update docs/context/STATUS.md

Edit STATUS.md to reflect the current state. Map to the table format:

Update every STATUS.md table per `references/templates.md` § Step 6 STATUS.md mapping — Current State, In Flight, Up Next, What's Done (real commit hashes; keep the last 20), Decisions Made (last 10; link ADRs created in Step 12), Known Issues, Dependencies and External Blockers.

**Update the "Last updated" date at the top.**

## Step 7: Update docs/context/CONVENTIONS.md (if needed)

Only update if this session:
- Established new patterns (e.g., "we now use React Query for all data fetching")
- Changed the tech stack (added a library, switched a tool)
- Discovered that an existing convention doesn't work and needs changing
- Added new commands to the project (update the Commands section)
- Established new boundaries (files that shouldn't be modified)

If no conventions changed, skip this file.

## Step 8: Update docs/context/GOALS.md (if needed)

Only update if:
- A goal was completed or substantially advanced — update Status
- A milestone was reached — update the milestones table
- Scope changed and non-goals need updating
- A new goal emerged from the session's work
- Priority framework needs adjustment

If no goals were affected, skip this file.

## Step 9: Update BACKLOG.md

**Inbox:**
- Remove items that were completed this session
- Add new items discovered during the session (bugs found, ideas sparked, follow-ups)

**Triaged:**
- Move items from Inbox to Triaged if they were discussed and prioritized
- Add priority and type tags: `P2 [feature] description`
- Update existing triaged items if scope or priority changed

**Parked:**
- Move items to Parked if explicitly set aside, with reason
- If an item was partially addressed, update it rather than removing

## Step 10: Update Active Plans (if applicable)

Check `docs/plans/` for any active implementation plan being followed:

- Mark completed tasks/steps with checkboxes or strikethrough
- Note deviations from the plan and why they were necessary
- Update remaining task estimates if complexity changed
- If the plan is fully complete, add a completion note at the top:
  ```markdown
  > **Status: COMPLETE** — All tasks implemented as of YYYY-MM-DD.
  ```
- If the plan needs revision, note what needs to change and whether to update now or defer

If no plan was being followed, skip this step.

## Step 11: Update Active Specs (if applicable)

Check `docs/specs/` for any spec that was being implemented:

- Update acceptance criteria checkboxes
- Note any scope changes or requirement discoveries
- Add open questions that emerged during implementation

If no spec was being followed, skip this step.

## Step 12: Create ADRs (if applicable)

Create an ADR only when a decision this session passes all three parts of the admission test: it would be hard to reverse, it would surprise someone reading the code without this context, and it involved a real trade-off rather than one obvious choice. See `docs/decisions/README.md` ("## When to Create an ADR") for the full criteria.

- File: `docs/decisions/NNN-kebab-case-title.md`
- Use the template from `docs/decisions/README.md`
- Number sequentially (check existing ADRs for the next number)
- Focus on the *why* — the code shows *what*, the ADR captures the reasoning
- Link the ADR from STATUS.md Decisions Made table

## Step 13: Update Auto-Memory (if it exists)

Check for Claude Code project memory:
```bash
find ~/.claude -name "MEMORY.md" -path "*$(basename $(pwd))*" 2>/dev/null
```

If it exists, update with:
- New pitfalls or gotchas (things that wasted time and will waste time again)
- Updated patterns (conventions established or changed)
- Recent changes summary (1-2 lines of what was done)
- Updated "start here" context
- Keep the memory file under 200 lines — condense older entries if growing

If no memory file exists, skip this step.

## Step 14: Clean Up Temporary Artifacts

Check for and clean up session artifacts:

Run the worktree, prune, and temp-file checks in `references/templates.md` § Step 14 cleanup; remove merged feature worktrees, record in-progress ones in Session Continuity, delete stray temp or backup files, and add a completion note to finished plans instead of moving them.

## Step 15: Stamp STATE.md (if it exists)

If `docs/context/STATE.md` already exists, invoke the `session-continuity` skill and follow it to record the current HEAD sha (`head:`) and timestamp (`last-updated:`) in the file's frontmatter — this is the freshness stamp `resume-session` compares against next time. Never create STATE.md here; a project with no execution state stays without one.

## Step 16: Commit Documentation Updates

After all documentation updates are complete:

```bash
git add CLAUDE.md BACKLOG.md docs/
git commit -m "docs: session wrap-up YYYY-MM-DD — [one-line summary of session work]"
```

If ADRs were created, mention them in the commit message:
```bash
git commit -m "docs: session wrap-up YYYY-MM-DD — [summary]. ADR-NNN: [decision title]"
```

## Step 17: Final Verification

After committing:

Run the checks in `references/templates.md` § Step 17 verification (no non-documentation file modified; working tree clean or only expected work) and revert any stray non-doc change.

Present final confirmation to the user:
- List which files were updated (with brief reason for each)
- List which files were skipped (and why — "no changes in that domain")
- If no learning cleared the bar in Step 5, state "No durable learnings this session" — this line belongs only in the report, never in LEARNINGS.md
- Flag any items that need human attention
- Confirm the docs commit was made

## Constraints

- Do NOT modify source code, tests, configs, or infrastructure — documentation only
- Do NOT create new documentation files unless creating an ADR (Step 12)
- Keep all updates factual and concise — no filler
- Preserve existing formatting and structure of each file
- If nothing changed in a file's domain, skip it — don't update for the sake of updating
- Never fabricate or assume what was done — use git history as ground truth
- If something is ambiguous, ask the user rather than guessing
- Always get user confirmation (Step 3) before modifying any files

## Success Criteria

Tick every item in `references/templates.md` § Success criteria before ending the session.
