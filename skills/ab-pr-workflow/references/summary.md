# Quick reference and common mistakes

Loaded on demand from SKILL.md when checking which step a situation calls for, or before pushing.

## Quick Reference

| Situation | Action |
|-----------|--------|
| Creating PR | Pre-flight (tests, plan audit) → Write → Scan body → Self-review |
| Body scan hits a secret or an address | Stop; redact; rescan before any push or PR command |
| Received feedback | Read all → Triage → Resolve → Commit → Re-run checks → Push |
| Single comment to fix | One pr-comment-resolver helper |
| Multiple independent comments | Parallel pr-comment-resolver helpers |
| Ready to merge | Base CI green? → Rebase → Test → Merge → Delete branch |
| Runner-driven run, or body only | Checks and plan audit → Body at `.agent-blueprint/run/pr-body.md` → Scan → Stop; the ship runner publishes |

## Common Mistakes

**Pushing without testing** — Run the tests after review fixes too, because a "simple rename" can break things.

**Responding defensively** — A review comment is information about how the code reads. If you disagree, explain your reasoning calmly with evidence.

**Giant PRs** — Keep a PR under about 400 lines of diff, because review quality drops past that. If larger, split it into stacked PRs or break the feature into increments.

**Mechanism first** — A body that opens with the diff walkthrough makes the reviewer reconstruct the why. Lead with the problem; size the rest by what they must decide.

**Fixing unrelated things** — Don't add "while I'm here" fixes to a PR. They muddy the review and increase risk. Create a separate PR.
