# PR body

Loaded on demand from SKILL.md when writing or rewriting a pull request body.

## Description rules

- **Motivation before mechanism.** The first paragraph states the problem and the outcome. A reader who stops after `## Why` knows whether to care; `## How` comes after.
- **Size by decision cost.** Length follows what the reviewer must decide, not the diff's line count. A low-risk diff gets a short body; a wide or risky one gets every section filled.
- **Honor a repository template.** If `.github/PULL_REQUEST_TEMPLATE.md` (or the repository's equivalent) exists, keep its section headers and fill them; add `## Plan audit` and the disclosure line inside it rather than replacing it.
- **Record unapplied findings.** Every self-review or reviewer finding you chose not to apply goes under `## Checklist` as an unticked `Not applied:` line with the reason. The reviewer sees the decision, not a silent omission.
- **Disclose AI assistance.** The body ends with the disclosure line; `CONTRIBUTING.md` owns the rule. Report the model identity you can actually report; "not disclosed" is an honest answer, a guessed model name is not.

## Template

```markdown
## What
[One paragraph: the problem, then the outcome — rationale before mechanism]

## Why
[Motivation — what problem does this solve, and what happens if it stays unsolved?]

## How
[Brief technical approach — not a code walkthrough, but the key design decisions]

## Testing
[How to verify this works — specific steps or test commands]

## Plan audit
| Item | State | Evidence |
|------|-------|----------|
[The classification table from ab-finishing-a-development-branch Step 3, or the single line `NO PLAN`]

Unplanned diff work:
[The list from the same audit, one line each, or `none`]

## Checklist
- [ ] Tests pass
- [ ] No new warnings
- [ ] Documentation updated (if applicable)
- [ ] Migration reversible (if applicable)
- [ ] Not applied: <review finding> — <reason> (one line per unapplied finding; drop when none)

AI assistance: <the model identity the agent can report, or "not disclosed">
```

## Body scan

Run it on the body file before `gh pr create`, `gh pr edit` or any push that carries the body. It must print nothing. A hit (a key, a token, an email address, a home-directory path) stops the command: redact or remove it, rescan, and only then run the command.

```bash
grep -nE 'AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|(^|[^A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|/(Users|home)/[A-Za-z0-9._-]+' .agent-blueprint/run/pr-body.md
```
