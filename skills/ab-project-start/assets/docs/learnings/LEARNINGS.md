# Key Learnings

Project-specific patterns, gotchas and insights discovered during development. The ab-session-wrap skill adds to this file at the end of a session; solved problems go in `docs/solutions/` instead.

**What belongs here:**

- Only learnings that will matter in future sessions.
- Two to four sentences each, with specifics: file paths, commands, error messages.
- When a learning invalidates an earlier entry, update that entry instead of adding a contradiction.
- When a convention was established, record it in `docs/context/CONVENTIONS.md` as well.

Add dated entries below, newest last, in this shape:

```markdown
### 2026-01-15: Vitest needs --pool=forks for native modules
Tests that load better-sqlite3 crash under the default threads pool. Run them with `vitest --pool=forks`; the flag is set in vitest.config.ts.
```
