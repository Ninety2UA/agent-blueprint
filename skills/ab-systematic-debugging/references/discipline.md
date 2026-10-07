# Discipline: when a shortcut looks reasonable

Loaded on demand from SKILL.md when a shortcut starts to look reasonable, a fix attempt fails, or the user signals the approach is off: when the process applies, the red flags, the user's redirections, the rationalizations with their answers, the phase summary and the measured payoff.

## When to Use

The process applies to any technical issue:
- Test failures
- Bugs in production
- Unexpected behavior
- Performance problems
- Build failures
- Integration issues

It matters most exactly when skipping it is tempting:
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- Previous fix didn't work
- You don't fully understand the issue

Keep to it even when:
- Issue seems simple (simple bugs have root causes too)
- You're in a hurry (rushing guarantees rework)
- Someone wants it fixed now (systematic is faster than thrashing)

## Red Flags

Each of these thoughts means: stop and return to Phase 1.
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "Pattern says X but I'll adapt it differently"
- "Here are the main problems: [lists fixes without investigation]"
- Proposing solutions before tracing data flow

Two point at something larger than a wrong hypothesis: "one more fix attempt" when two or more have already failed, and each fix revealing a new problem in a different place. After three failed fixes, question the architecture (SKILL.md, Phase 4 step 5): is the pattern fundamentally sound, or kept through inertia? Would refactoring it beat fixing more symptoms?

## The User's Signals That the Approach Is Off

These redirections mean the investigation went wrong, and each one sends you back to Phase 1:
- "Is that not happening?": you assumed without verifying.
- "Will it show us...?": you should have added evidence gathering.
- "Stop guessing": you are proposing fixes without understanding.
- "Ultrathink this" or "think harder": question fundamentals, not just symptoms.
- "We're stuck?" (frustrated): your approach isn't working.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process" | Systematic debugging is faster than guess-and-check thrashing. |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right from the start. |
| "I'll write test after confirming fix works" | Untested fixes don't stick. Test first proves it. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |
| "Reference too long, I'll adapt the pattern" | Partial understanding guarantees bugs. Read it completely. |
| "I see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem. Question pattern, don't fix again. |

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors, reproduce, check changes, gather evidence | Understand what broke and why |
| **2. Pattern** | Find working examples, compare | Identify differences |
| **3. Hypothesis** | Form theory, test minimally | Confirmed or new hypothesis |
| **4. Implementation** | Create test, fix, verify | Bug resolved, tests pass |

## Real-World Impact

From debugging sessions:
- Systematic approach: 15-30 minutes to fix
- Random fixes approach: 2-3 hours of thrashing
- First-time fix rate: 95% vs 40%
- New bugs introduced: Near zero vs common
