# writing-plans — interface context for parallel executors

Loaded on demand from `SKILL.md` when a plan will run in waves (`/orchestrate`, `/team-execution`); nothing here is needed for a sequential plan.

When creating plans that will run in parallel (wave execution via `/orchestrate`), embed key types/interfaces/exports from the codebase directly in the plan. This prevents executors from wasting context exploring the codebase to discover contracts.

**When a plan USES existing code:**

After determining which files the task touches, extract the key interfaces from source files it depends on:

````markdown
### Interface Context
<!-- Extracted from codebase — executor should use directly, no exploration needed -->

From `src/types/user.ts`:
```typescript
export interface User {
  id: string;
  email: string;
  role: 'admin' | 'member';
}
```

From `src/api/auth.ts`:
```typescript
export function validateToken(token: string): Promise<User | null>;
```
````

**When a plan CREATES new interfaces consumed by later tasks:**

Add a "Task 0: Define contracts" step that creates type files before implementation:

```markdown
### Task 0: Define interface contracts

**Files:**
- Create: `src/types/newFeature.ts`

**Step 1:** Create type definitions that downstream tasks will implement against.
These are the contracts — implementation comes in later tasks.

**Step 2:** Commit: `chore: define newFeature type contracts`
```

**When to include:** Plan touches files that import from other modules, creates a new API endpoint, modifies a component's props, or depends on a previous wave's output.

**When to skip:** Plan is self-contained (creates everything from scratch), pure configuration, or all patterns are already established.
