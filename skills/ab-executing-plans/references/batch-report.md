# Batch report

Loaded on demand from SKILL.md when you scan a finished batch for stubs and write its report.

## Stub Tracking

After completing each batch, scan created/modified files for stub patterns before reporting:

- Hardcoded empty values flowing to rendering: `= []`, `= {}`, `= null`, `= ""`
- Placeholder text: "not available", "coming soon", "placeholder", "TODO", "FIXME"
- Components with no data source wired (props always receiving empty/mock data)

If stubs are found, include a `### Known Stubs` section in the batch report:

```markdown
### Known Stubs
- `src/components/Dashboard.tsx:45` — `items = []` hardcoded, API not wired yet (Task 5 will resolve)
- `src/api/users.ts:23` — `// TODO: add pagination` (out of scope for this plan, added to BACKLOG)
```

Don't mark a batch as fully complete if stubs prevent the planned feature from working end-to-end. Either wire the data or document which future task resolves it.
