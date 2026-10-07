# Quick reference, mistakes and integration

Loaded on demand from SKILL.md when checking a situation against the quick reference, the common mistakes or the skills this one pairs with.

## Quick Reference

| Situation | Action |
|-----------|--------|
| `.worktrees/` exists | Use it (verify ignored) |
| `worktrees/` exists | Use it (verify ignored) |
| Both exist | Use `.worktrees/` |
| Neither exists | Check the instructions file, then ask the user (headless: the global location) |
| Directory not ignored | Add to .gitignore + commit (no-commit mode: create no worktree) |
| Tests fail during baseline | Report failures + ask (headless: stop and hand back) |
| No package.json/Cargo.toml | Skip dependency install |
| Removal refused (dirty tree) | Report state, keep worktree, relay the force command to the user |

## Common Mistakes

### Skipping ignore verification

- **Problem:** Worktree contents get tracked, pollute git status
- **Fix:** Run `git check-ignore` before creating a project-local worktree

### Assuming directory location

- **Problem:** Creates inconsistency, violates project conventions
- **Fix:** Follow the priority: an existing directory, then the instructions file's preference, then ask

### Proceeding with failing tests

- **Problem:** Can't distinguish new bugs from pre-existing issues
- **Fix:** Report failures, get explicit permission to proceed

### Hardcoding setup commands

- **Problem:** Breaks on projects using different tools
- **Fix:** Auto-detect from project files (package.json, etc.)

## Example Workflow

```
You: I'm using the ab-using-git-worktrees skill to set up an isolated workspace.

[Check .worktrees/ - exists]
[Verify ignored - git check-ignore confirms .worktrees/ is ignored]
[Create worktree: git worktree add .worktrees/auth -b feature/auth]
[Run npm install]
[Run npm test - 47 passing]

Worktree ready at /Users/you/myproject/.worktrees/auth
Tests passing (47 tests, 0 failures)
Ready to implement auth feature
```

## Red Flags

Each of these breaks the isolation or hides a failure the baseline exists to catch.

**Never:**
- Create worktree without verifying it's ignored (project-local)
- Skip baseline test verification
- Proceed with failing tests without asking
- Assume directory location when ambiguous
- Skip the instructions-file check
- Force a worktree removal, or tidy a dirty worktree so the removal passes

**Always:**
- Follow the directory priority: an existing directory, then the instructions file's preference, then ask
- Verify directory is ignored for project-local
- Auto-detect and run project setup
- Verify clean test baseline

## Integration

**Called by:**
- **ab-subagent-driven-development** - required before executing any tasks
- **ab-executing-plans** - required before executing any tasks
- Any skill needing isolated workspace

**Pairs with:**
- **ab-finishing-a-development-branch** - required for cleanup after work complete; its Step 6 and discard path follow "Removing a Worktree" in SKILL.md
