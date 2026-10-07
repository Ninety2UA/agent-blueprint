---
name: ab-deployment-verification
description: "Runs a go/no-go check before a deployment: a read-only helper verifies build, tests, security, migrations, configuration, dependencies, the rollback plan and monitoring with concrete evidence and returns GO, CONDITIONAL GO or NO-GO, where any blocking issue means NO-GO; the verdict is recorded in STATUS.md and blockers go to BACKLOG.md. Use before any production deployment, including small changes and hotfixes, before a staging deployment (abbreviated check), or when the user asks whether something is ready to deploy, go live, launch or push to production. Not for deploying to a local dev environment, or for opening a PR (use ab-pr-workflow)."
---

# Deployment Verification

A systematic go/no-go checklist for production deployments. The deployment-verifier helper checks eight critical areas and returns a verdict with evidence and a rollback plan specific to this deployment. The run is done when the verdict has been acted on and recorded.

## When to Use

- Before deploying to production
- Before deploying to staging (abbreviated check)
- After a hotfix, before emergency deployment
- When someone says "ship it" or "deploy"

## The Iron Law

No deployment without a green checklist. Any blocking issue makes the deployment a NO-GO until it is resolved, whatever the deadline, however small the change, and however much pressure there is to ship. A small change breaks production as easily as a large one, and a delayed release costs less than an outage.

## Process

### Step 1: Dispatch the Verifier

Fill in the inputs from the repository rather than asking: the current branch, the target the request names (production when it names none), the changes since the last deploy (a brief summary from the git log), and any risks the user mentioned.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/deployment-verifier.md`. Inputs:

```
Verify deployment readiness for [project/service].

Context:
- Deploying from branch: [branch name]
- Target environment: [production/staging]
- Changes since last deploy: [brief summary or "see git log"]
- Known risks: [any concerns]

Run all 8 verification areas and produce a go/no-go recommendation.
```

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

### Step 2: Review the Report

When the helper returns, review:
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

The table is the verdict's recommendation. A NO-GO decides itself: do not deploy. Report the blocking issues, and once they are fixed, run Step 1 again. On GO or CONDITIONAL GO, the decision to deploy belongs to the user.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: 1. Deploy now, tracking any warnings for follow-up. 2. Fix the warnings first, then re-verify from Step 1. 3. Hold the deployment. Default when nobody answers: hold (option 3) and report the verdict, with any warnings recorded. Deploy unattended only when the request or the calling pipeline explicitly asked for a deployment to this environment and the verdict is GO, where every check passed: a readiness question is not a deploy order, and an unattended run should not accept risks nobody has looked at.

### Step 4: Document

After deployment (or after deciding not to deploy):
- Record the verdict and any issues in `docs/context/STATUS.md`
- If the deployment went ahead, update the deployment log
- If blocked, add blocking issues to `BACKLOG.md` with P0 priority
- If it went ahead on CONDITIONAL GO, add the warnings to `BACKLOG.md` so they are followed up

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
