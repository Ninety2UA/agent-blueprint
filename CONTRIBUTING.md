# Contributing

Thank you for your interest in contributing to Agent Blueprint. The plugin runs in eight coding CLIs (Claude Code, Codex, Antigravity, Grok Build, Pi, Cursor CLI, Hermes and Amp), so every change is held to the rules that keep it working in all of them.

## How to contribute

### Reporting issues

Open an issue describing:

- What you expected to happen
- What actually happened
- Which tool you ran it in, and its version
- Steps to reproduce (if applicable)

### Submitting a skill or a helper prompt

1. Fork the repository
2. Create a branch: `feat/skill-name`
3. Add the skill in `skills/ab-<name>/SKILL.md`, with its detail in `skills/ab-<name>/references/`; helper prompts go in `references/agents/<name>.md` of the skill that dispatches them. Nothing goes in `.claude/skills` or a host-specific folder.
4. Use the ab-writing-skills skill to write it. It holds the rules below, the reasons for them and the test-first method: write the scenario the skill must handle, write the skill, then check it against the scenario.
5. Open a pull request that says what the skill does, when a tool should pick it, and an example session showing it in action.

### Improving existing content

- Fix typos, clarify instructions, improve examples
- Open a PR with a clear description of what changed and why

## Rules every skill follows

These are what the portability gate checks, so a change that breaks one fails CI.

- **Name skills in prose, never with a slash.** Write "use the ab-writing-plans skill", because every host invokes skills differently (`/name`, `$name`, `/skill:name`, prose only on Amp).
- **No host-only paths or variables.** No `${CLAUDE_PLUGIN_ROOT}`, no `$ARGUMENTS`, no path outside the skill's own folder, no `.claude/` working files; the blueprint's working files live under `.agent-blueprint/`. Bundled scripts are found from the skill's own directory and run through their interpreter.
- **Host-dependent steps use the capability snippets.** Helper step, asking the user, task tracking, lower effort, working folder, provenance, no-commit mode and bundled scripts each have one wording in `skills/ab-writing-skills/references/capability-snippets.md`. Paste the snippet byte for byte; edit it only there, then run `python3 scripts/sync-shared.py` to rewrite the copies.
- **The whole `SKILL.md` stays under 8,000 bytes**, frontmatter included, because Codex truncates there silently. Move detail into `references/` at the point of use rather than deleting it.
- **agentskills frontmatter only.** `name`, `description`, plus `argument-hint` and `disable-model-invocation`; pipeline skills add `metadata.version`. No `model` or `effort`: the user chooses both, and helpers inherit them.
- **Descriptions lead with what the skill does, then when to use it**, since some tools choose skills from a short catalog.
- **A helper prompt has no frontmatter.** It opens with a one-line role header (what it may change, whether it is safe at lower effort, and that it starts no helpers of its own) and ends with an `## Output` section, so a helper run and an inline run return the same shape. A prompt several skills share has one owner, registered in `scripts/prompt-owners.json`, and byte-identical copies.
- **Nothing Hermes would quarantine.** No HTML comments, no instruction to edit `AGENTS.md` or `CLAUDE.md` by name, no download piped into a shell.

## Before you open a pull request

Run the gates from `AGENTS.md`; CI runs the same set:

```bash
bash scripts/check-drift.sh
python3 scripts/check-skill-collisions.py
python3 scripts/check-portability.py
python3 scripts/check-manifests.py
python3 scripts/sync-shared.py --check
python3 -m unittest discover -s tests/gates
claude plugin validate --strict .claude-plugin/plugin.json
```

The allowlist in `scripts/portability-allowlist.json` only shrinks: fix a violation rather than adding an entry.

## Guidelines

- **Keep skills focused**: one skill does one thing well
- **Include examples**: show, don't just tell
- **Test with your host**: verify the change in the tool you use, and say which one in the PR; a change to a host-dependent step should be tried in a tool with helpers and one without
- **Follow the existing style**: match the tone and structure of the skills around yours
- **Document triggers**: the description says what the skill does and when a tool should pick it
- **Disclose AI assistance**: end your PR body with an `AI assistance:` line. The ab-pr-workflow skill adds it for you when you use that skill; otherwise add it by hand
- **Report only what you can verify**: name the model identity the agent can actually report; "not disclosed" is an honest answer when it cannot, since skills and helpers run on whatever model and effort the session used

## Code of conduct

Be respectful and constructive. We're all here to build better tools.
