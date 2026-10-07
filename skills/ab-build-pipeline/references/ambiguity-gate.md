# Ambiguity gate

Loaded on demand from SKILL.md when Stage 1 scores the requirements, or when Quick mode checks whether a change is small.

Score the requirements before proceeding, because a plan built on unclear scope or untestable criteria ships the wrong shape.

| Dimension | Weight | Question |
|-----------|--------|----------|
| **Scope clarity** | 40% | Is it clear what's in and out of scope? Are boundaries explicit? |
| **Constraint clarity** | 30% | Are technical constraints, dependencies, and limitations stated? |
| **Success criteria clarity** | 30% | Are acceptance criteria specific and testable? |

Rate each dimension 0.0–1.0. Calculate: `clarity = (scope × 0.4) + (constraints × 0.3) + (criteria × 0.3)`

For **brownfield** tasks (modifying existing code), add **Context clarity (15%)** and adjust weights to 35%/25%/25%/15%.

- If clarity **≥ 0.8** → proceed to Stage 2
- If clarity **< 0.8** → ask about the weakest dimension at the Stage 1 checkpoint before proceeding (SKILL.md § Checkpoints). Headless, settle it by its most conservative reading and mark that decision as assumed.
