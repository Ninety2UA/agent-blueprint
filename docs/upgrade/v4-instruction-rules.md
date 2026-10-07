# v4 instruction rules: where each v3 rule went

U10 rewrote the root `AGENTS.md` and the scaffold's `AGENTS.md` as principles with reasons. Every ALWAYS, NEVER and other hard rule in the v3 instruction files (`CLAUDE.md` and `templates/CLAUDE.md`) had one of three outcomes: it is **enforced** by a gate, hook, script or permission; it is **kept** as a principle with its reason; or it is **dropped** because current models do it by default or it no longer applies. The v4.0 decision record takes this table as its instruction-rules ledger.

| v3 rule | Outcome | Where it lives now, or why it went |
|---|---|---|
| Do what has been asked; nothing more, nothing less | Kept | "Do what was asked": extra changes cost review time and hide the requested one |
| ALWAYS read a file before editing it | Dropped | Default model behavior, and hosts such as Claude Code refuse an edit to an unread file |
| NEVER create files unless absolutely necessary; prefer editing existing files | Kept | "Prefer editing to creating": a new file is new surface to maintain |
| NEVER proactively create documentation unless requested | Kept | Folded into "Prefer editing to creating" |
| NEVER commit secrets, credentials, or .env files | Enforced | Template `.gitignore`; the ship runner's pre-push secret scan and the interactive publish scan (KTD7); kept as a one-line principle |
| Evidence before claims | Kept | "Evidence before claims", backed by the ab-verification-before-completion skill |
| When in doubt, ask | Kept | "When to decide and when to ask", with the unattended-run default |
| If you break something while fixing something else, fix the regression first | Kept | "Fix what you break first" |
| Commit working code frequently | Kept | "Commit small and often" |
| Deviation rules: auto-fix list, must-ask-first list, scope boundary | Kept | "When to decide and when to ask"; the ask-first list is the user's authority, not a style rule |
| Error handling: fail loudly at boundaries, log context, never swallow errors, validate at the edges | Kept | "Code", as one principle with its reason |
| Error recovery table | Kept | "When something goes wrong" |
| Analysis Paralysis Guard (5+ read-only operations, then stop) | Dropped | Current models do not stall this way, and the count misfires on legitimate research |
| Lightweight workflow for changes under three files | Kept | "Blueprint skills": ab-quick-fix for small work, ab-brainstorming then ab-build-pipeline for large |
| Files under 500 lines | Dropped | A size rule without a reason; splitting by responsibility is the model's default judgment |
| Typed interfaces for public APIs | Kept | "Code", with the reason |
| Write tests FIRST | Kept | "Code", with the ab-test-driven-development skill |
| DRY, YAGNI | Dropped | Default model behavior; "Do what was asked" covers the YAGNI half |
| Run linter and tests before every commit | Kept | "Commit small and often" names the commands from `CONVENTIONS.md` |
| One logical change per commit | Kept | "Commit small and often" |
| No TODO comments without a BACKLOG.md entry | Kept | "Code", with the reason |
| No commented-out code | Kept | "Code", with the reason |
| Commit format `type(scope): description` | Enforced | The opt-in commit validation hook where the host runs hooks; kept as "Commits" |
| Context loading order (SessionStart hook, CLAUDE.md, STATUS.md ...) | Kept | "Where things are" and the line on reading `STATUS.md` and `CONVENTIONS.md` first; the hook is host-specific and no longer listed |
| Session Continuity block in the instructions file | Moved | `docs/context/STATUS.md` § Session Continuity (U6, KTD8) |
| Maintainer gotchas in the template (Stop hook, `execFileSync`, `docs/images`) | Moved | Root `AGENTS.md` only; they concern this repository, not user projects |
| Each Agent Teams teammate MUST own specific files | Kept | "Parallel work", for every host's helpers, with the reason |
| Skill and pipeline tables with slash commands | Kept | Skill names in prose, since every host starts skills differently (KTD4) |
| Plugin-provided counts ("53 skills, 10 hooks") in the template | Dropped | A scaffolded file is copied once and the counts would go stale in every project |
