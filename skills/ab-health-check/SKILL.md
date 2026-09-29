---
name: ab-health-check
description: "Runs a project health check across eight areas (build, tests, lint, dependencies, convention compliance, documentation freshness, backlog, git) with the commands from docs/context/CONVENTIONS.md, then reports a status table, the items that need attention and the next actions. Use when the user asks how the project is doing, whether everything is working or passing (including just the build or the tests), or wants diagnostics across the whole project. Not for a progress or status update (ab-project-status) or for debugging one failing test or error (ab-systematic-debugging)."
---

# Health Check — Project Health Assessment

Run a comprehensive health assessment across all project dimensions. Report findings and flag items that need attention.

## Checks (run as many in parallel as possible)

The build, test and lint commands come from `docs/context/CONVENTIONS.md`. Where it names none, use the ones the project's own manifest or build file defines (such as `package.json` scripts or a `Makefile`), and mark the row ⚠️ with "no command found" when there is none, so a missing command never reads as a pass.

### 1. Build Status
```bash
[build command from CONVENTIONS.md]
```
**Pass:** Build completes without errors or warnings
**Fail:** Note the error/warning output

### 2. Test Status
```bash
[test command from CONVENTIONS.md]
```
**Pass:** All tests pass, note total count
**Fail:** List failing tests by name

### 3. Lint Status
```bash
[lint command from CONVENTIONS.md]
```
**Pass:** No lint errors or warnings
**Fail:** Note error count and most common categories

### 4. Dependency Health
```bash
# Check for outdated dependencies (npm/yarn/pip/etc.)
[outdated command]

# Check for known vulnerabilities
[audit command]
```
**Pass:** No critical/high vulnerabilities, deps reasonably current
**Fail:** List critical vulnerabilities and severely outdated deps

### 5. Convention Compliance

Read `docs/context/CONVENTIONS.md`. Spot-check the 5 most recently changed files against the conventions. Note any violations.

### 6. Documentation Freshness

Check if key docs are up to date:
```bash
# When were context docs last modified?
ls -la docs/context/STATUS.md docs/context/GOALS.md docs/context/CONVENTIONS.md 2>/dev/null

# When was the Session Continuity section last updated?
grep "Last session:" docs/context/STATUS.md
```
**Pass:** Docs updated within last 7 days
**Warning:** Docs older than 7 days
**Fail:** Key docs missing

### 7. Backlog Health

Read `BACKLOG.md`:
- Count items in Inbox (untriaged)
- Count items in Triaged
- Flag any P0/critical items not being worked on

### 8. Git Health
```bash
# Uncommitted changes
git status --short

# Unpushed commits
git log @{u}..HEAD --oneline 2>/dev/null

# Stale branches
git branch --merged main | grep -v main | grep -v '*'
```

## Report Format

```markdown
## Project Health Report

| Area | Status | Details |
|------|--------|---------|
| Build | ✅/⚠️/❌ | [brief note] |
| Tests | ✅/⚠️/❌ | [X passing, Y failing] |
| Lint | ✅/⚠️/❌ | [error count] |
| Dependencies | ✅/⚠️/❌ | [vulns/outdated count] |
| Conventions | ✅/⚠️/❌ | [violations found] |
| Documentation | ✅/⚠️/❌ | [freshness] |
| Backlog | ✅/⚠️/❌ | [untriaged count] |
| Git | ✅/⚠️/❌ | [uncommitted/unpushed] |

### Items Needing Attention
1. [Most critical finding]
2. [Second finding]
3. [Third finding]

### Recommended Next Actions
1. [First action]
2. [Second action]
```

Present the report, then offer to address the findings.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: 1. address the items needing attention, most critical first; 2. address only the items the user picks; 3. leave everything as it is. Default when nobody answers: option 3, because a health check reports and changes nothing unasked.
