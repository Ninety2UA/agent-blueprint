# Spike patterns

Loaded on demand from SKILL.md when the spike compares approaches, tests feasibility, or maps an external system.

## A/B Comparison Spike

Comparing two approaches. Fix the criteria before building anything, then build one throwaway artifact per option to the same depth, so neither wins on polish. Score both against those criteria. The artifacts are deleted; the matrix and the reason go into the report and the plan.

```markdown
## Spike: PostgreSQL vs. SQLite for local-first sync

**Question:** Which database handles our offline-first sync requirements better?
**Timebox:** 3 hours

### Approach A: PostgreSQL + logical replication
- [findings]

### Approach B: SQLite + cr-sqlite
- [findings]

### Comparison Matrix
| Criterion | PostgreSQL | SQLite |
|-----------|-----------|--------|
| Offline support | ... | ... |
| Sync complexity | ... | ... |
| Query performance | ... | ... |

### Recommendation: [choice] because [evidence-based reasoning]
```

## Feasibility Spike

Can we do this at all?

```markdown
## Spike: Browser-based PDF generation

**Question:** Can we generate PDFs client-side without a server round-trip?
**Timebox:** 2 hours

### Tested Libraries
1. jsPDF — [result]
2. pdf-lib — [result]
3. Puppeteer in WASM — [result]

### Answer: YES, using pdf-lib. Limitations: [list]
```

## Integration Spike

How does this external system work?

```markdown
## Spike: Stripe Connect onboarding flow

**Question:** What's the minimum integration for marketplace seller onboarding?
**Timebox:** 2 hours

### API Endpoints Used
- [endpoint]: [what it does, gotchas]

### Auth Flow
- [sequence of calls]

### Undocumented Behavior
- [anything surprising]
```
