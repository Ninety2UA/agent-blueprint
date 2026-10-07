---
# Blueprint Per-Project Configuration
# Customize which agents are active for this project's tech stack.
# This file is gitignored — each developer can have their own config.

# Review agents dispatched by the ab-review-swarm skill
# Comment out agents that aren't relevant to your stack.
review-agents:
  # Always active (language-agnostic)
  - code-reviewer
  - security-sentinel
  - performance-oracle
  - code-simplicity-reviewer
  - convention-enforcer
  - test-coverage-reviewer

  # Activate based on project type
  # - architecture-strategist    # Uncomment for large/complex codebases
  # - frontend-reviewer          # Uncomment for projects with UI
  # - data-integrity-guardian    # Uncomment for projects with database migrations
  # - schema-drift-detector      # Uncomment for projects with ORM schemas

# Specialized agents (auto-dispatched by pipelines — not user-configurable)
# These agents are used internally by the ab-build-pipeline, ab-ship-pipeline and ab-orchestrate skills:
#   - plan-checker             # Verifies plans are achievable before execution
#   - integration-verifier     # Verifies tasks work together after each wave
#   - deployment-verifier      # Pre-deployment verification (8 areas)
#   - findings-synthesizer     # De-duplicates and prioritizes review findings
#   - research-synthesizer     # Merges research findings from parallel agents
#   - bug-reproduction-validator  # Validates bug reproductions
#   - test-gap-analyzer        # Identifies missing test coverage
#   - pr-comment-resolver      # Resolves PR review comments (uses worktree)
#   - codebase-mapper          # Full codebase structure analysis
#   - integration-checker      # Cross-component integration checks

# Research agents dispatched by the ab-deep-research skill
research-agents:
  - learnings-researcher
  - best-practices-researcher
  - framework-docs-researcher
  - git-history-analyzer
  - codebase-context-mapper

# Project type (used for agent selection hints)
# Options: web-fullstack, api-backend, cli-tool, library, mobile, data-pipeline
project-type: web-fullstack

# Team work (the ab-orchestrate skill) needs no setting here: pass --wave-size N to change
# the helpers per wave (default 4). It uses Claude Code Agent Teams when
# CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS is "1" in an interactive session, and Codex
# multi_agent_v2 when that feature is on; the tool's own switch is the only setting.

# Tech stack (informational — helps agents focus)
# languages: [typescript, python, ruby, go, rust, etc.]
# frameworks: [next.js, rails, django, express, etc.]
# databases: [postgresql, mysql, sqlite, mongodb, etc.]
---

# Project-Specific Notes

_Add project-specific configuration notes here. This section is read by agents for additional context._

## Stack Details

_Fill in the relevant lines, for example:_

```text
- Primary language: TypeScript
- Framework: Next.js 15 (App Router)
- Database: PostgreSQL via Prisma
- Testing: Vitest + Playwright
- CI: GitHub Actions
```

## Review Focus Areas

_Areas reviewers should pay extra attention to, for example:_

```text
- Authentication flows (OAuth + JWT)
- Data privacy (PII handling, GDPR compliance)
- Performance for endpoints with > 1000 req/min
```
