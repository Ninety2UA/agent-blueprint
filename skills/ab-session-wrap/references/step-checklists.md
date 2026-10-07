# ab-session-wrap — step checklists

Loaded on demand from SKILL.md when a step points here for its full checklist.

## Step 1 files to read

**Project state files (read all):**
- `docs/context/STATUS.md` — its Session Continuity section first, then the rest: in flight, up next, what's done, known issues
- The project instructions file (AGENTS.md, or CLAUDE.md when only that one exists) — behavioral rules
- `docs/learnings/LEARNINGS.md` — key learnings and gotchas
- `docs/context/GOALS.md` — current objectives, milestones, non-goals
- `docs/context/CONVENTIONS.md` — tech stack, patterns, boundaries (check if new patterns emerged)
- `BACKLOG.md` — inbox, triaged, parked items

**Documentation files (check which exist):**
- `docs/plans/*.md` — any active implementation plans
- `docs/decisions/*.md` — any architecture decision records
- `docs/specs/*.md` — any feature specs
- `docs/research/*.md` — any research docs

**Host project memory (if your host keeps one):** for Claude Code's auto-memory, find it with:
```bash
find ~/.claude -name "MEMORY.md" -path "*$(basename $(pwd))*" 2>/dev/null
```

## Planning session rules

A plan is not delivery, so a planning session marks no goal, milestone or task as "completed" or "done" anywhere. Specifically:
- Step 4 (Session Continuity): "What was done" says "planned [feature]" or "wrote plan for [feature]", not "implemented" or "built"
- Step 4 (Session Continuity): "Start here" says "execute the plan at docs/plans/...", not "continue implementing"
- Step 6 (STATUS.md): add the plan to "In Flight" or "Up Next"; move nothing to "What's Done"
- Step 8 (GOALS.md): mark no goal or milestone complete; at most note "plan written for [goal]"
- Step 10 (Plans): leave the plan unmarked as complete, since it has not been executed yet
- Skip Step 7 (CONVENTIONS.md) and Step 11 (Specs): planning doesn't change conventions or specs

## Step 2 analysis questions

1. **What changed?** — Map every git commit and uncommitted change. Include files added, modified, deleted, renamed. Note new dependencies added.
2. **What decisions were made?** — Architectural choices, technology selections, pattern adoptions, approaches rejected. Look beyond commits — file structure changes, new directories, config changes all signal decisions.
3. **What was learned?** — Pitfalls discovered, debugging dead ends, things that worked unexpectedly well or poorly, workarounds needed, documentation that was misleading.
4. **What broke or was surprising?** — Edge cases found, assumptions that were wrong, regressions introduced and fixed, unexpected behaviors.
5. **What's unfinished?** — Work started but not completed, tests that need writing, refactors deferred, TODO comments added.
6. **What's the state of the code right now?** — Does it build? Do tests pass? How many tests pass/fail? Are there uncommitted changes? Is the working tree clean?
7. **Goal alignment** — Cross-reference completed work against GOALS.md objectives and milestones. Did this session advance current goals? Did scope creep happen? Should any goals be updated?

## Step 4 rules

The Session Continuity section is what the next session reads first. It lives in `docs/context/STATUS.md`, not the project instructions file, because notes written to AGENTS.md never load in a repository that still has a CLAUDE.md, and Hermes drops an instructions file that changes shape.

**Rules:**
- Be specific enough that a new agent can start immediately without re-reading everything
- Include file paths and test names
- If there are failing tests, list them by name
- "Start here" should be a single actionable instruction, not a list
- Remaining Work ends on a closable next action: something the reader can start now (a file to open, a command to run, a failing test to fix), never a topic such as "look into auth"
- List uncommitted work from earlier in the session under uncommitted changes, so the next session finds it
- **Never summarize summaries.** Regenerate this section from actual project state (git log, test results, file system), not from the previous Session Continuity content. Summaries drift from reality like a photocopy of a photocopy — each compression loses information. The codebase and git history are the lossless source of truth, so reconcile against them every time.

## Step 5 entry format and rules

Append new entries to `docs/learnings/LEARNINGS.md` (create the file if it doesn't exist):

```markdown
### YYYY-MM-DD: [Brief title of learning]
[What was learned and why it matters. Include specific details — file paths, error messages, version numbers — that will help future sessions avoid the same pitfall or replicate the same success. Link to ADRs if relevant.]
```

**Rules:**
- Only add learnings that will matter in future sessions — not every commit needs an entry
- Keep each entry to 2-4 sentences but be specific (include file paths, commands, error messages)
- If a learning invalidates a previous entry, update the previous entry rather than adding a contradictory new one
- If a new learning contradicts or supersedes an existing entry, also run the ab-knowledge-compounding skill's Gardening Checklist over the affected entries and any docs/solutions/ pages they cite before wrapping
- If conventions or patterns were established, also update docs/context/CONVENTIONS.md (Step 7)
- If nothing this session clears the bar, add nothing to LEARNINGS.md and instead state "No durable learnings this session" in the Step 17 confirmation report. That sentence belongs in the report only, because in LEARNINGS.md it is noise every later reader has to skip

## Step 7 triggers

Only update if this session:
- Established new patterns (e.g., "we now use React Query for all data fetching")
- Changed the tech stack (added a library, switched a tool)
- Discovered that an existing convention doesn't work and needs changing
- Added new commands to the project (update the Commands section)
- Established new boundaries (files that shouldn't be modified)

If no conventions changed, skip this file.

## Step 8 triggers

Only update if:
- A goal was completed or substantially advanced — update Status
- A milestone was reached — update the milestones table
- Scope changed and non-goals need updating
- A new goal emerged from the session's work
- Priority framework needs adjustment

If no goals were affected, skip this file.

## Step 9 backlog sections

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

## Step 10 plan updates

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

## Step 11 spec updates

Check `docs/specs/` for any spec that was being implemented:

- Update acceptance criteria checkboxes
- Note any scope changes or requirement discoveries
- Add open questions that emerged during implementation

If no spec was being followed, skip this step.

## Step 12 ADR format

- File: `docs/decisions/NNN-kebab-case-title.md`
- Use the template from `docs/decisions/README.md`
- Number sequentially (check existing ADRs for the next number)
- Focus on the *why* — the code shows *what*, the ADR captures the reasoning
- Link the ADR from STATUS.md Decisions Made table

## Step 13 memory updates

Find the host's project memory file; for Claude Code's auto-memory:
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

## Step 16 commit messages

After all documentation updates are complete:

```bash
git add BACKLOG.md docs/
git commit -m "docs: session wrap-up YYYY-MM-DD — [one-line summary of session work]"
```

If ADRs were created, mention them in the commit message:
```bash
git commit -m "docs: session wrap-up YYYY-MM-DD — [summary]. ADR-NNN: [decision title]"
```

## Constraints

Besides the documentation-only and ground-truth rules in SKILL.md:

- Create no new documentation file except an ADR (Step 12) or a missing LEARNINGS.md (Step 5)
- Keep all updates factual and concise — no filler
- Preserve existing formatting and structure of each file
- If nothing changed in a file's domain, skip it — don't update for the sake of updating
- Put anything ambiguous to the user in the Step 3 question rather than guessing; a headless run records it as an open question under Remaining Work
