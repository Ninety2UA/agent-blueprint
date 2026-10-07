# Framing the problem

Loaded on demand from SKILL.md when an architectural change reaches step 2: the fog test, the premise challenge, the blindspot pass and the scope modes, run in that order.

## Fog Test

Before challenging the premise, check whether there is enough shape to challenge yet:

1. **Can you state the destination in one sentence?** If "done" can't be named yet, that's fog: the next step is narrowing the destination, not designing toward it.
2. **Can you name the first three decisions right now?** If the immediate next choices aren't nameable yet, the work needs more exploration (or a spike, as in SKILL.md's ceremony sizing), not more design.

Both checks pass: proceed to the premise challenge. Either fails: resolve the fog first.

## Premise Challenge

Before diving into design options, challenge the premise of the request itself:

1. **Is this the right problem to solve?** Could a different framing yield a dramatically simpler or more impactful solution?
2. **What is the actual user or business outcome?** Is the request the most direct path to that outcome, or is it solving a proxy problem?
3. **What would happen if we did nothing?** Is this a real pain point or a hypothetical one?
4. **What existing code already partially solves this?** Map every sub-problem to existing code before proposing new code.

If the premise challenge reveals a better framing, put it to the user in SKILL.md step 3, before any design options; that step's headless default applies.

## Blindspot Pass

The rest of this skill assumes the user can evaluate the questions you ask. That assumption breaks when the user is working in unfamiliar territory ("I know nothing about X but need to…", a domain they have never shipped in, or a decision space where they cannot yet tell which choices matter). Asking decision questions first would force them to answer things they do not yet understand.

When the user signals unfamiliarity (or you detect it), run a blindspot pass **before** asking any decision questions:

1. **Map the decision surface**: enumerate the decisions this work actually requires, including the ones the user does not know they need to make. Where are the forks in the road?
2. **Surface the blind spots**: for each decision, name what the user would need to know to choose well, and flag the ones they are least likely to be aware of.
3. **Present the map, then ask**: show the decision surface and the blind spots first so the user learns the shape of the problem. Only then begin the one-at-a-time questions of step 3, now that the user can actually evaluate them.

This composes with the sections around it: run the premise challenge first (is this even the right problem?), then the blindspot pass (what does deciding well require?), then apply a scope mode and proceed to questions. Skip it when the user is clearly fluent in the domain; the blindspot pass is for unfamiliar territory, not every session. In a headless or pipeline run nobody answers, so the questions take step 3's default: record the recommended answers as explicit assumptions and proceed, and the pass informs the work instead of blocking it.

## Scope Modes

When presenting design options, the user can choose a scope posture. Default based on context:

| Mode | Default For | Posture |
|------|------------|---------|
| **Expansion** | Greenfield features | Propose the ambitious version. What's the 10x better product for 2x the effort? |
| **Selective Expansion** | Feature enhancements | Hold scope as baseline, but surface opportunities individually for cherry-picking |
| **Hold Scope** | Bug fixes, refactors | Maximum rigor on existing scope. No expansions surfaced. |
| **Reduction** | Overbuilt plans, tight deadlines | Cut to minimum viable. Be ruthless. |

If the user doesn't specify, infer the mode from context and state your assumption. Once a mode is selected, hold it: drifting silently toward another mode changes the scope the user agreed to without their knowing.
