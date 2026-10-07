# Rationalizations

Loaded on demand from SKILL.md when you are tempted to skip the design, or someone argues for skipping it.

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every change that lands in the **Architectural** tier goes through this process: a todo list, a single-function utility, a config change, all of them once they're architectural by SKILL.md's sizing. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short (a few sentences for truly simple projects), but it is still presented and approved, because the approval is where a wrong assumption gets caught.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "This is too simple to need a design" | Simple changes are where unexamined assumptions cause the most rework. A 2-minute design review costs less than the rework. |
| "I'll figure it out as I go" | Implementation without a design is just typing. The design surfaces dependencies and edge cases the keyboard won't. |
| "The user described it clearly, just build it" | Even clear requests carry implicit assumptions. The design surfaces them before code locks them in. |
| "Brainstorming will slow us down" | A 10-minute brainstorm prevents hours of wrong-direction work. Speed without direction is rework. |
| "I'll just propose one approach" | One option is a recommendation disguised as a decision. Two-to-three options give the user something to choose between. |
| "Premise challenge feels confrontational" | Challenging the premise *before* design is collaborative. Discovering at review that you solved the wrong problem is not. |
| "I can hold the design in my head" | Context windows compress, sessions end, teammates forget. The design doc is the artifact that survives all three. |
| "I'll just batch all my questions to save time" | Batching is a narrow exception for questions that are genuinely residual after settling from the repository and context, not a shortcut around asking one at a time when you haven't checked what's already answered. |
