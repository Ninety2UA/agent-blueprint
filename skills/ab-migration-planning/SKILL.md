---
name: ab-migration-planning
description: "Plans a migration so every step can be undone: a blast-radius analysis of data, services and dependents, atomic expand-contract steps each deployable on its own, a forward and a rollback for each step with irreversible steps marked and backed up first, verification checks, and a pre-, during- and post-migration checklist. Use when a change needs careful sequencing, data transformation or rollback, whether or not the user calls it a migration: schema changes (adding, renaming, changing or dropping tables and columns), backfills and format changes, API version transitions and deprecated endpoints, breaking changes, major framework, ORM or runtime upgrades, and any change where just deploying it could corrupt data or break downstream systems. Not for a simple dependency addition (ab-dependency-management)."
---

# Migration Planning

## Overview

Create safe, reversible migration plans with explicit rollback procedures. Covers database schema changes, API version transitions, major dependency upgrades, and data transformations. The plan is done when every step has its forward, rollback and verification written down and the execution checklist is written for this migration.

## When to Use

- Adding, modifying, or removing database tables/columns
- Transitioning between API versions
- Upgrading major dependencies (framework, ORM, runtime)
- Transforming existing data (backfills, format changes)
- Any change where "just deploy it" could corrupt data or break downstream systems

## The Iron Law

**Hard gate.** No migration without a rollback plan: every migration step has a documented reverse operation, and a step that cannot be reversed is marked irreversible and requires a data backup before it runs. A migration without a way back turns one bad step into lost or corrupted data in production, which no later fix can undo.

## Process

### Step 1: Impact Analysis

Before writing any migration code, analyze the blast radius:

**Data impact:**
- Which tables/collections are affected?
- How many rows/documents will be modified?
- Are there foreign key constraints or cascading effects?
- Is this change backward-compatible with the current application code?

**Service impact:**
- Which services read/write the affected data?
- Will there be downtime during migration?
- Can the migration run while the application is serving traffic?
- What happens to in-flight requests during migration?

**Dependency impact:**
- Do other teams or services depend on the schema/API being changed?
- Are there cached schema versions that need invalidating?
- Do ORMs need regeneration?

### Step 2: Design Migration Steps

Break the migration into atomic, ordered steps, so any step can ship, be verified and be rolled back on its own. Each step is:
- **Independently deployable** — can be released without the next step
- **Backward-compatible** — old code works with new schema (expand-contract pattern)
- **Reversible** — has a documented rollback procedure

**Expand-Contract Pattern for Schema Changes:**
1. **Expand:** Add new column/table (old code ignores it)
2. **Migrate:** Backfill data from old to new structure
3. **Switch:** Update application code to use new structure
4. **Contract:** Remove old column/table (after verification period)

### Step 3: Write Rollback Plan

For each step, document the exact rollback:

```markdown
### Step N: [description]

**Forward:**
[SQL/code to apply the change]

**Rollback:**
[SQL/code to reverse the change]

**Rollback verification:**
[How to confirm the rollback worked]

**Irreversible?** No / Yes — requires backup of [table] before proceeding
```

### Step 4: Verification Plan

Define how to verify each step succeeded:

```markdown
### Verification for Step N

- [ ] Row count matches expected: `SELECT COUNT(*) FROM [table]`
- [ ] No null values in required column: `SELECT COUNT(*) FROM [table] WHERE [col] IS NULL`
- [ ] Application health check passes
- [ ] No errors in application logs for 5 minutes after migration
```

### Step 5: Execution Checklist

```markdown
## Pre-Migration
- [ ] Database backup completed
- [ ] Backup verified (test restore)
- [ ] Stakeholders notified
- [ ] Maintenance window scheduled (if needed)
- [ ] Rollback procedure reviewed by team

## During Migration
- [ ] Step 1 applied and verified
- [ ] Step 2 applied and verified
- [ ] [etc.]

## Post-Migration
- [ ] Application health check passes
- [ ] No elevated error rates for 15 minutes
- [ ] Monitoring alerts reviewed
- [ ] Stakeholders notified of completion
```

## Quick Reference

| Migration Type | Key Risk | Key Mitigation |
|---------------|----------|----------------|
| Add column | None (additive) | Default value for existing rows |
| Remove column | Data loss | Verify no code references, backup first |
| Rename column | Breaking | Use expand-contract: add new, copy, drop old |
| Change type | Data loss | Add new column, convert, verify, drop old |
| Add table | None (additive) | Ensure foreign keys are correct |
| Drop table | Data loss | Backup, verify no references, grace period |
| Backfill data | Performance | Batch processing, off-peak hours |

## Common Mistakes

**Deploying code and migration simultaneously** — Deploy the migration first, verify it worked, then deploy the code that uses it. Avoid atomic "big bang" deployments: when both change at once, a failure cannot be traced to either, and neither can be rolled back alone.

**No rollback testing** — If you haven't tested the rollback, you don't have a rollback plan. You have a rollback hope.

**Forgetting in-flight requests** — A migration that takes 30 seconds means 30 seconds of potentially inconsistent state. Plan for what happens to requests during that window.

**Irreversible steps without backup** — If a step can't be undone (dropping a column, transforming data destructively), take a backup before that step, not just at the start.
