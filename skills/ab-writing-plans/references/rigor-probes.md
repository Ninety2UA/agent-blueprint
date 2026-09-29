# ab-writing-plans — requirements rigor probes

Loaded on demand from `SKILL.md` when requirements did not come from a probed brainstorming session.

Before diving into planning, verify the incoming requirements are solid. If they did not come from a probed brainstorming session, scan for these five gap types. Fire each as a prose question to the user — not a checklist.

| Probe | Question | When to Fire |
|-------|----------|-------------|
| **Evidence gap** | "What evidence do we have that this is actually the problem?" | Requirements assert a problem without citing user data, logs, or incidents |
| **Specificity gap** | "Can you give a concrete example of when this would happen?" | Requirements describe abstract scenarios without grounding in real use cases |
| **Counterfactual gap** | "What if we didn't do this — what breaks?" | Requirements lack a clear cost-of-inaction; the feature might be nice-to-have |
| **Attachment gap** | "Are we attached to this solution, or is there a simpler approach?" | Requirements prescribe a specific implementation rather than describing the problem |
| **Durability gap** | "Will this still matter in 6 months?" | Requirements address a transient pain point that may resolve itself |

**Rules:**
- Fire at most 2-3 probes per planning session — don't interrogate
- Skip probes where the answer is obvious from the requirements doc
- If requirements came from a rigorous brainstorming session with probes already applied, skip this section entirely
- Probes that surface real gaps → pause planning, send the user back to refine requirements
- Probes that are satisfactorily answered → proceed to planning
- Probes nobody answers (a headless or pipeline run) → proceed, and write each one into the plan as an assumption, as SKILL.md step 1's default says
