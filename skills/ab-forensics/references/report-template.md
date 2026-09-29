# Forensics report

Loaded on demand from SKILL.md when writing the report in Step 4.

## Format

```markdown
# Forensics Report: <run id or symptom>

**Run:** <id / log path>
**Investigated:** <ISO timestamp>
**Verdict:** STUCK_LOOP | MISSING_ARTIFACTS | ABANDONED_WIP | CRASH | UNKNOWN

## Summary
<2–4 sentences: what happened, root signal, recommended next action>

## Evidence

### <Category>
- <Specific observation> — `<file path>:<line>` or commit `<sha>`
- ...

## Timeline
| Time | Event | Source |
|------|-------|--------|
| 14:30 | Run started | log line 1 |
| 14:42 | Wave 2 dispatched | log line 387 |
| 14:58 | Wave 2 first failure | log line 1042 |
| ...

## Root Cause Hypothesis
<one-paragraph hypothesis with evidence cited>

## Confidence
- Tier (1–6, see Evidence tiers below): <X>
- Why: <what could change this hypothesis>

## Recommended Next Action
- [ ] <Specific step the user should take before retrying>
- [ ] <Optional fix>

## Unverifiable
- <Claims that couldn't be checked from logs/git alone>
```

## Evidence tiers

The Confidence tier, strongest first: 1 direct reproduction; 2 a repro script or discriminating test; 3 logs, traces, history, configs; 4 independent paths agreeing; 5 reading one code path; 6 intuition. A hypothesis resting only on tier 5 or 6 says so under Confidence.
