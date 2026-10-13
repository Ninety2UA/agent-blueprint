# Project Status

Last updated: 2026-10-13

## Session Continuity

_Kept current by the ab-session-wrap and ab-context-checkpoint skills. Full history: git log and docs/learnings/._

**Last session:** 2026-10-13

**What was done:** v4.1.0 is released: pull request #26 merged as `6e27430`, which carries the tag `v4.1.0` and the GitHub release. In 4.1.0:

- Each of the eight tools installs the blueprint from GitHub with its own command and updates through its own updater. `install.sh` runs those same routes for every tool on the machine at once.
- Skill instructions were reworded so a literal model keeps existing code and does not ask again for a design the user already approved.
- `ab-project-start` refuses the home folder and `/`.
- Codex gets listing copy, display names, a setup skill and a write guard for `apply_patch` edits.

The checklist items that can run on the build machine passed (`docs/releases/v4.1.0-checklist.md`), and the site deployed from `main`.

v4.1.1 (pull request #28, tagged `v4.1.1` with its GitHub release) stops `install.sh` from removing or replacing Cursor's `agent-blueprint` marketplace. Cursor keeps marketplaces on the account, so 4.1.0's changes reached the maintainer's other computers too. Where the installer had added that marketplace itself, it now says to uninstall Cursor's own copy in `/plugin`. For a marketplace from another source, it prints the commands that switch it. Compound Engineering never touches a Cursor marketplace either.

**What's remaining:**

- In the Codex app (`ChatGPT.app` on this Mac): the setup check, which the checklist marks must-pass and the maintainer chose to run right after the merge; trusting the hooks in `/hooks`; and the display names in the `$` picker.
- In Cursor CLI: the `/plugin` install, then the changeover check with `install.sh`.
- The checklist's after-merge section.
- Next release: 4.2.0 adds nine more tools. Its plan is not written yet.

**Start here:** `docs/releases/v4.1.0-checklist.md`, then the description of pull request #26.

## Current State of the Code

- **Build:** none for the plugin (the repository is the plugin); the site in `site/` builds with Astro
- **Tests:** `python3 -m unittest discover -s tests/gates`, `bash tests/hooks/run-tests.sh`, `bash tests/runner/run-tests.sh`, `node --test 'site/test/**/*.test.mjs'`
- **Lint:** markdownlint and shellcheck, as CI runs them
- **Gates:** drift, skill collisions, portability (with the shrink-only allowlist), manifests, snippet sync, the site checks and `claude plugin validate --strict`; see AGENTS.md § Gates
