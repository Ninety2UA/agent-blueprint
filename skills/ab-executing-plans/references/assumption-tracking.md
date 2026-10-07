# Assumption tracking

Loaded on demand from SKILL.md when you record an interpretive decision in the plan.

## Assumption Tracking

During execution, you will make interpretive decisions — the spec says "handle errors" and you choose to return 400 with a JSON body; the plan says "add validation" and you choose specific validation rules. These decisions are invisible unless documented.

**After each task**, if you made any interpretive choices, append them to the plan file under an `### Assumptions` heading:

```markdown
### Assumptions
- Task 3: "Handle errors" interpreted as returning 400 with `{ error: string }` JSON body (not HTML error pages)
- Task 3: Rate limiting set to 100 req/min per IP (common default, not specified in plan)
- Task 5: "Support pagination" interpreted as cursor-based, not offset-based (better for large datasets)
```

**Rules:**
- Only document decisions where a reasonable engineer might have chosen differently
- Skip obvious choices (naming a variable, import ordering)
- The user reviews these at batch checkpoints (Step 3), not in real-time — don't interrupt execution to ask about each one
- If an assumption has cascading impact (other tasks will build on it), flag it: `[cascading]`
