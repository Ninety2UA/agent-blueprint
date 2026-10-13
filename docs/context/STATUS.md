# Project Status

Last updated: 2026-10-13

## Session Continuity

_Kept current by the ab-session-wrap and ab-context-checkpoint skills. Full history: git log and docs/learnings/._

**Last session:** 2026-10-13

**What was done:** v4.1.0 is merged into `main` (pull request #26, merge commit `6e27430`) but not yet tagged or released; the last tagged release is v4.0.2. In 4.1.0:

- Each of the eight tools installs the blueprint from GitHub with its own command and updates through its own updater. `install.sh` runs those same routes for every tool on the machine at once.
- Skill instructions were reworded so a literal model keeps existing code and does not ask again for a design the user already approved.
- `ab-project-start` refuses the home folder and `/`.
- Codex gets listing copy, display names, a setup skill and a write guard for `apply_patch` edits.

The checklist items that can run on the build machine passed (`docs/releases/v4.1.0-checklist.md`), and the site deployed from `main`.

**What's remaining:**

- In the Codex app (`ChatGPT.app` on this Mac): the setup check, which the checklist marks must-pass and the maintainer chose to run right after the merge; trusting the hooks in `/hooks`; and the display names in the `$` picker.
- In Cursor CLI: the `/plugin` install, then the changeover check with `install.sh`.
- Tag `v4.1.0` on `6e27430` and publish the GitHub release with `docs/releases/v4.1.0-release-notes.md`, then work through the checklist's after-merge section.
- Open question: on a machine that has the Claude Code plugin, `install.sh` removes Cursor's `agent-blueprint` marketplace. Cursor keeps marketplaces on the account, so the removal also reaches the maintainer's other machines.
- Next release: 4.2.0 adds nine more tools. Its plan is not written yet.

**Start here:** `docs/releases/v4.1.0-checklist.md`, then the description of pull request #26.

## Current State of the Code

- **Build:** none for the plugin (the repository is the plugin); the site in `site/` builds with Astro
- **Tests:** `python3 -m unittest discover -s tests/gates`, `bash tests/hooks/run-tests.sh`, `bash tests/runner/run-tests.sh`, `node --test 'site/test/**/*.test.mjs'`
- **Lint:** markdownlint and shellcheck, as CI runs them
- **Gates:** drift, skill collisions, portability (with the shrink-only allowlist), manifests, snippet sync, the site checks and `claude plugin validate --strict`; see AGENTS.md § Gates
