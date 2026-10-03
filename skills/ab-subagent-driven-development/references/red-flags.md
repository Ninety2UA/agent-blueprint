# Red flags

Loaded on demand from SKILL.md when a helper asks questions, a reviewer finds issues, a helper fails, or you are tempted to skip a step.

## Red Flags

**Never do these; each one lets a defect through or lets helpers collide:**
- Start implementation on main/master branch without explicit user consent (every task commits there)
- Skip reviews (spec compliance OR code quality)
- Proceed with unfixed issues
- Start several implementer helpers in parallel (they edit the same files and conflict)
- Make a helper read the plan file (provide the full task text instead, so it spends no context finding it)
- Skip scene-setting context (the helper needs to understand where the task fits)
- Ignore helper questions (answer before letting them proceed)
- Accept "close enough" on spec compliance (spec reviewer found issues = not done)
- Skip review loops (reviewer found issues = implementer fixes = review again)
- Let implementer self-review replace actual review (both are needed)
- Start code quality review before spec compliance passes (wrong order: quality review of code that may still change for the spec is wasted)
- Move to the next task while either review has open issues

**If a helper asks questions:**
- Answer clearly and completely
- Provide additional context if needed
- Don't rush them into implementation

**If a reviewer finds issues:** follow the fix-rounds paragraph in SKILL.md step 3 (same implementer, findings batched, BASE pinned, five rounds then `— BLOCKED`). A fresh implementer replaces one the host cannot reach, and also one that sends no reply within your wait window.

**If a helper fails its task:**
- Start a fix helper with specific instructions
- Don't fix it by hand: the details would crowd the context you need for coordinating
