# Agent Blueprint — Maintainer Instructions

This repository is the Agent Blueprint plugin. The repository root is the plugin root, so everything here ships to users: keep maintainer-only material in `docs/`, the gates in `scripts/` and the tests in `tests/`. The current state of the work, and where the last session stopped, is in `docs/context/STATUS.md`; read it first.

## Philosophy

Each unit of work should make the next one easier, not harder. The patterns set here are copied into every project that installs the blueprint, so a shortcut taken once is taken everywhere.

## Layout

```
.claude-plugin/                          # plugin.json and marketplace.json (the repo root is the plugin root)
skills/                                  # 53 skills, each a folder with SKILL.md, references/, and optional scripts/ and assets/
skills/ab-project-start/assets/          # The project scaffold: AGENTS.md, CLAUDE.md (@AGENTS.md), docs/, BACKLOG.md
hooks/claude-code.json, codex.json       # Hook files declared by path in each host's manifest (no hooks/hooks.json: Grok would load it)
hooks/handlers/                          # The handlers; each exits unless it detects its own host
scripts/                                 # Gates (check-*.py, check-drift.sh), sync-shared.py, the allowlist, prompt-owners.json
tests/gates/                             # Unit tests for the gates and the skill contracts
docs/upgrade/                            # The v3-to-v4 name map and upgrade notes
docs/learnings/, docs/plans/             # Historical records; they keep the old project name
docs/images/                             # README and site images (not installed into projects)
AGENTS.md                                # This file; CLAUDE.md is a symlink to it
install.sh                               # Installer and scaffold helper
```

Helpers get their instructions from prompt files in the dispatching skill's `references/agents/`. A shared prompt file has one owner and byte-identical copies, registered in `scripts/prompt-owners.json`. Skills carry no `model` or `effort`: the session's model and effort are the user's choice, and helpers inherit them. A prompt may keep material it needs only in some runs (catalogs, long tables, worked examples) in a companion note named `<prompt>-<topic>.md` beside it, loaded at the point of use; the companion is a plain note, counted and checked as one by the gates, and a shared prompt's companion is registered with the same copies.

## Gates

Run these before you push; CI runs the same set on every pull request.

| Command | Checks |
|---------|--------|
| `bash scripts/check-drift.sh` | Count and version claims on every surface match the tree, and README.md and index.html say nothing about adopting ideas from other projects or analyzing them |
| `python3 scripts/check-skill-collisions.py` | Frontmatter YAML, `references/` pointers and § headings resolve, no near-duplicate descriptions |
| `python3 scripts/check-portability.py` | The portability rules for all eight hosts (see the ab-writing-skills skill's `references/portable-authoring.md`) |
| `python3 scripts/check-manifests.py` | Every host manifest and every skill's `metadata.version` agree with the release |
| `python3 scripts/sync-shared.py --check` | Snippet and shared-file copies match their owners |
| `python3 -m unittest discover -s tests/gates` | The gate and skill-contract tests |
| `claude plugin validate --strict .claude-plugin/plugin.json` | The plugin manifest, with Claude Code's own validator |

The allowlist in `scripts/portability-allowlist.json` only shrinks: a fixed violation must leave it, and CI fails an entry added since the pull request's base.

## Changing skills

- Use the ab-writing-skills skill. It holds the rules, the reasons for them and the test-first method.
- A SKILL.md stays within 8,000 bytes, frontmatter included, because Codex truncates there silently. Move detail into `references/` at the point of use rather than deleting it.
- Name other skills in prose, never with a slash, because every host invokes skills differently.
- Steps that depend on the host use the capability snippets from `skills/ab-writing-skills/references/capability-snippets.md`. Edit a snippet only there, then run `python3 scripts/sync-shared.py` to rewrite the copies.
- Working files live under `.agent-blueprint/`, never `.claude/`, which other tools treat as foreign.

## Releasing

Bump the version in `.claude-plugin/plugin.json`, the marketplace entry and every skill's `metadata.version` together (the manifest gate holds them equal) whenever plugin content changes on the default branch, then run `python3 scripts/sync-shared.py`, which writes the new version into each pipeline skill's provenance command. Installed plugin caches only re-sync when the version changes, so an unbumped release never reaches users.

## How to work

- **Do what was asked.** Extra changes cost review time and hide the requested one; note the rest in the pull request or an issue.
- **Evidence before claims.** Run the gate or test that proves a change before you say it works, and quote its result.
- **Fix what you break first.** A regression on top of the original change is much harder to untangle.
- **Commit small and often,** one logical change per commit, with the gates green, so each commit can be reviewed or reverted alone.
- **Keep secrets out.** No credentials, tokens or `.env` files in commits; the ship runner's secret scan is a backstop, not a license.
- **Ask before** changing a public contract (skill names, manifest shape, the run-state files, the installer's flags), adding a dependency or an external service, or making an architectural choice the plan does not cover. These reach every user.

## Commits

Format: `type(scope): brief description`, with a body that says why. Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `perf`.

## Gotchas

- Hook definitions nest twice: `"hooks": [{"hooks": [...]}]`. Missing the inner array fails silently.
- Hook scripts use `execFileSync`, never `execSync`, so no argument reaches a shell.
- A regular-file `CLAUDE.md` at a plugin root fails `claude plugin validate --strict`; it has to stay a symlink to `AGENTS.md`.
- Headless `claude -p` refuses to read plugin files outside the working directory unless it runs with `--permission-mode auto` or `--add-dir <plugin root>`; the ship runner and the smoke test use the first.
- A Stop hook that blocks does not reset the context; only a fresh session does, which is why the ship runner starts one per iteration.
- Every helper in a team wave owns specific files and only the lead commits; two helpers editing one file lose each other's work.
- Hermes quarantines a skill whose text tells the agent to edit the instructions file by name, writes it from a shell, or pipes a download into a shell, and drops a context file with an HTML comment. The portability gate mirrors those checks.

## Learnings

`docs/learnings/` holds the decision records: what was decided, what was rejected, and why. Read the relevant one before reopening a decision.
