# Reviewer selection

Loaded on demand from SKILL.md when Step 2 picks the reviewers for a diff.

## Always-on reviewers

Started on every run, whatever the diff:

| Helper | Focus |
|-------|-------|
| **code-reviewer** | Plan alignment, code quality, architecture |
| **code-simplicity-reviewer** | YAGNI, over-engineering, unnecessary complexity |
| **test-coverage-reviewer** | Test quality and behavioral coverage |

## Conditional reviewers

Scan the diff and files to decide which conditional reviewers to start. A reviewer starts when any one of its signals is present.

| Helper | Activation Signals | Skip When |
|-------|-------------------|-----------|
| **security-sentinel** | Diff touches auth, sessions, tokens, passwords, API keys, user input handling, SQL/ORM queries, file uploads, CORS config, or environment variables | Pure styling/docs changes |
| **performance-oracle** | Diff touches database queries, loops over collections, API endpoints, caching logic, or file I/O; OR diff is 200+ lines (large changes have hidden perf implications) | < 50 lines touching only UI/tests |
| **convention-enforcer** | Diff introduces new files, new patterns, or touches config/build files; OR diff modifies 5+ files (cross-cutting changes need convention checks) | Single-file bug fix following existing patterns |
| **frontend-reviewer** | Diff contains CSS, HTML templates, JSX/TSX components, style imports, responsive/a11y attributes, or browser API usage | No frontend files in diff |
| **architecture-strategist** | Diff adds new services, modules, or API endpoints; modifies dependency injection; changes directory structure; OR introduces new abstractions | Bug fix within existing architecture |
| **data-integrity-guardian** | Diff contains migration files, schema changes, model validations, data transformation logic, or bulk operations | No data layer changes |
| **schema-drift-detector** | Diff modifies schema.rb, migration files, or ORM model definitions | No schema-related files |

## Activation process

1. Read the diff (from Step 1).
2. For each conditional reviewer, check its activation signals against the diff.
3. Log each reviewer started and why: "Activating security-sentinel: diff touches `src/auth/`".
4. Log each reviewer skipped and why: "Skipping frontend-reviewer: no frontend files in diff".
5. The always-on reviewers plus the activated conditional ones are the final dispatch list.
