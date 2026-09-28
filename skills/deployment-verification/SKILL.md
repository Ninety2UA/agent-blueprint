---
name: deployment-verification
description: "Trigger this skill before ANY production deployment — even if the user seems confident everything is fine. Trigger when the user says 'deploy', 'deploy check', 'ready to deploy', 'go live', 'production ready', 'pre-deploy', 'ship it', 'push to prod', 'release to production', 'launch', or 'can we deploy this'. Trigger even for 'just a small change' deployments — small changes cause outages too. Verifies build, tests, security, migrations, configuration, dependencies, rollback plan, and monitoring readiness. Dispatches the deployment-verifier agent for a systematic go/no-go checklist. DO NOT TRIGGER for deploying to local dev environments. DO NOT TRIGGER for creating PRs — use pr-workflow instead."
---

# Deployment Verification

## Overview

Systematic go/no-go checklist for production deployments. Dispatches the deployment-verifier agent to check all critical areas and produces a clear recommendation.

## When to Use

- Before deploying to production
- Before deploying to staging (abbreviated check)
- After a hotfix, before emergency deployment
- When someone says "ship it" or "deploy"

## The Iron Law

<HARD-GATE>
NO DEPLOYMENT WITHOUT A GREEN CHECKLIST. If any blocking issue is found, the deployment is a NO-GO until it's resolved. No exceptions — not for deadlines, not for "it's just a small change," not for pressure from stakeholders.
</HARD-GATE>

## Process

### Step 1: Dispatch the Verifier

Dispatch the **deployment-verifier** agent:

```
Task: Verify deployment readiness for [project/service].

Context:
- Deploying from branch: [branch name]
- Target environment: [production/staging]
- Changes since last deploy: [brief summary or "see git log"]
- Known risks: [any concerns]

Run all 8 verification areas and produce a go/no-go recommendation.
```

### Step 2: Review the Report

When the agent returns, review:
- **Verdict:** GO, NO-GO, or CONDITIONAL GO
- **Blocking issues:** Must be resolved before deployment
- **Warnings:** Should be resolved soon but don't block deployment
- **Rollback plan:** Must be specific and actionable

### Step 3: Act on the Verdict

| Verdict | Action |
|---------|--------|
| **GO** | Proceed with deployment |
| **CONDITIONAL GO** | Proceed but track warnings for follow-up |
| **NO-GO** | Fix blocking issues and re-verify |

### Step 4: Document

After deployment (or after deciding not to deploy):
- Record the verdict and any issues in `docs/context/STATUS.md`
- If the deployment went ahead, update the deployment log
- If blocked, add blocking issues to `BACKLOG.md` with P0 priority

## Quick Reference

| Check Area | What's Verified |
|------------|----------------|
| Build | Compiles cleanly, no warnings |
| Tests | All pass, coverage maintained |
| Security | No vulns, no secrets, auth reviewed |
| Migrations | Reversible, tested, backward-compatible |
| Configuration | Correct env vars, no dev config in prod |
| Dependencies | Lock file current, no floating versions |
| Rollback | Plan exists and is tested |
| Monitoring | Health checks, alerts, logging |

## Common Mistakes

**Skipping for "small changes"** — Small changes cause production incidents too. Every deployment gets the full checklist.

**Trusting CI alone** — CI checks are necessary but not sufficient. The deployment-verifier checks things CI doesn't (rollback plans, config correctness, monitoring).

**Deploying with warnings** — Conditional GO means "go, but track the warnings." Don't let warnings accumulate across deployments.
