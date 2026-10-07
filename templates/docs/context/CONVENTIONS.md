# Project Conventions

## Tech Stack

<!-- Fill in your actual stack. This is the first thing the agent reads before writing code. -->

- **Language:** [TypeScript / Python / etc.]
- **Runtime:** [Node.js 20+ / Bun / Python 3.12+]
- **Framework:** [Next.js 14 / FastAPI / etc.]
- **Database:** [PostgreSQL / BigQuery / etc.]
- **ORM/Query:** [Prisma / SQLAlchemy / raw SQL]
- **Infrastructure:** [GCP Cloud Run / AWS Lambda / Vercel / etc.]
- **Linting:** [ESLint + Prettier / Biome / Ruff]
- **Testing:** [Jest / Pytest / Vitest]
- **CI/CD:** [GitHub Actions / Cloud Build / etc.]
- **Package manager:** [npm / pnpm / yarn / uv / pip]

## Commands

<!-- Fill in the actual commands. These are referenced by skills and agents. -->

```bash
# Install dependencies
[install command]

# Run development server
[dev command]

# Run tests
[test command]

# Run tests in watch mode
[test watch command]

# Run linter
[lint command]

# Run linter with auto-fix
[lint fix command]

# Build for production
[build command]

# Type check (if applicable)
[typecheck command]
```

## Code Standards

- Indentation: [tabs / 2 spaces / 4 spaces]
- Line width: [80 / 100 / 120] characters
- Semicolons: [yes / no] (JS/TS)
- Quotes: [single / double]
- Trailing commas: [all / es5 / none]
- Run lint before committing — `[lint command]`
- Run tests before pushing — `[test command]`

## File Organization

```
src/
├── [layer or module 1]/    # [description]
├── [layer or module 2]/    # [description]
├── [shared/common/utils]/  # [description]
└── [entry point]           # [description]

tests/
├── [mirrors src/ structure]
└── [test utilities/fixtures]
```

Source code in `src/` organized by: [module / feature / layer — pick one and describe it]

Tests mirror `src/` structure in `tests/`. Test files named `[module].test.[ext]` or `test_[module].[ext]`.

Infrastructure configs in `infra/`. One-off scripts in `scripts/`.

## Naming Conventions

- **Files:** `kebab-case.ts` / `snake_case.py`
- **Directories:** `kebab-case/`
- **Classes/Types:** `PascalCase`
- **Functions/variables:** `camelCase` / `snake_case`
- **Constants:** `UPPER_SNAKE_CASE`
- **Database tables:** `snake_case`
- **Database columns:** `snake_case`
- **Environment variables:** `UPPER_SNAKE_CASE`
- **CSS classes:** [BEM / Tailwind / CSS Modules]

## Patterns in Use

<!-- Document patterns adopted in this project so the agent follows them consistently. -->

### Data fetching
[Describe the pattern — e.g., "All API calls go through src/lib/api-client.ts which handles auth headers and error parsing"]

### State management
[Describe the pattern — e.g., "Server state via React Query, local UI state via useState"]

### Authentication
[Describe the pattern — e.g., "JWT access + refresh tokens, stored in httpOnly cookies"]

### Error handling
[Describe the pattern — e.g., "Custom AppError class with code/message/statusCode, caught at API boundary by error middleware"]

### Logging
[Describe the pattern — e.g., "Structured JSON logging via pino, log level from LOG_LEVEL env var"]

## Testing Conventions

- Follow TDD: write failing test → minimal code to pass → refactor
- Unit tests for pure logic, integration tests for API endpoints and database queries
- Test behavior, not implementation — avoid testing private methods
- Use real implementations over mocks wherever feasible
- Mocking is acceptable for: external APIs, time-dependent code, expensive I/O
- Test file naming: `[module].test.[ext]` co-located with source or in `tests/`
- Fixtures and test helpers in `tests/fixtures/` and `tests/helpers/`

## Dependency Management

- Pin exact versions in lockfile
- Audit dependencies before adding — check bundle size, maintenance status, license
- Prefer standard library over third-party when feasible
- Document why non-obvious dependencies were added (in commit message or ADR)
- Run `[audit command]` periodically for security vulnerabilities

## Git Workflow

- Branch from `main` for features: `feat/short-description`
- Branch from `main` for fixes: `fix/short-description`
- Squash merge to main (single clean commit per feature)
- Delete branches after merge
- Never force-push to main
- Rebase feature branches on main before merging

## Environment Variables

<!-- List all env vars the project uses with descriptions but NOT values. -->

| Variable | Required | Description |
|----------|----------|-------------|
| `[VAR_NAME]` | yes/no | [what it's for] |

## Boundaries — Never Modify Without Explicit Permission

<!-- List files/directories that should never be modified by the agent autonomously. -->

- `.env` and `.env.*` files — managed manually, may contain secrets
- `*.lock` files — managed by package manager only
- `infra/` configs — require manual review before changes
- CI/CD workflows in `.github/` — require manual review
- Database migrations — require explicit approval before creating or running
- `package.json` / `pyproject.toml` dependencies — ask before adding new deps
