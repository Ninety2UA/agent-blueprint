---
name: ab-writing-skills
description: "Writes, edits and tests skills that load and run in every tool Agent Blueprint supports: agentskills frontmatter, a SKILL.md under 8,000 bytes with detail in references/, capability snippets for host-dependent steps, prompt files for helpers, and a baseline test before the skill is written. Use when creating or editing a skill, rewriting its description or frontmatter, cutting it to size, or finding out why it does not trigger."
---

# Writing Skills

A finished skill is one any of the eight supported tools can discover and run, that states its outcome before its steps, and that was tested against a baseline: you watched an agent fail without it, then pass with it. Writing a skill is test-driven development applied to instructions.

**Not for:** a project's own conventions (they go in the project instructions file) or a rule a script can check (write the check instead; save prose for judgment calls).

## Shape the skill

1. **Outcome first.** Open with what the skill produces and how the reader knows it is done.
2. **Then the smallest protocol.** Only the steps that must happen, in order.
3. **Then judgment.** Say what to weigh and why, and let the model decide. Current models follow a stated outcome well and follow long rule lists too literally.

For each host-dependent step, name the capability, then what a finished step returns, then the fallback when the host lacks it; tool names appear only as examples. State rules as principles with reasons ("keep PRs small, because reviewers stop reading"), not bare ALWAYS or NEVER. Drop lines such as "think carefully". Where the skill must wait for the user, name the default an unattended run takes.

## Frontmatter and description

- Keys: the agentskills fields plus `argument-hint` and `disable-model-invocation`. No `effort` or `model`: the user chooses both.
- `name`: `ab-` plus lowercase words joined by hyphens, equal to the folder name.
- `description`, at most 1,024 characters: lead with what the skill does and how, then "Use when ..." with the situations that call for it. Tools that choose from a short catalog need the mechanism first. Keep it distinct from sibling skills; `scripts/check-skill-collisions.py` fails near-duplicates.
- A skill only the user should start is manual-only: `disable-model-invocation: true` plus `agents/openai.yaml` turning implicit invocation off, a narrow description, and no other skill naming it.

Examples of good and weak descriptions: `references/cso-examples.md`.

## Write the body portably

- Name other skills in prose: "use the `ab-writing-plans` skill". Hosts invoke skills differently, so never write a slash form.
- Keep every path inside the skill's folder. Text two skills need is copied into both and registered, not linked across.
- Name the project instructions file, not AGENTS.md or CLAUDE.md, when a step records something there; working folders go under `.agent-blueprint/`.
- No HTML comments, no argument placeholders or host variables, and no phrasing Hermes treats as injection.

Every rule, with its reason and gate id: `references/portable-authoring.md`.

## Capability snippets

Five steps depend on what the host can do: **Helper step.**, **Asking the user.**, **Tracking tasks.**, **Lower effort.** and **Bundled scripts.** Each has one fixed wording in `references/capability-snippets.md`. Paste the snippet as a paragraph of its own, byte for byte, and put the site's details (prompt file, inputs, default) in the next paragraph. Edit only the owner, then run `python3 scripts/sync-shared.py` to rewrite the copies.

## Helpers and prompt files

A step that hands work to a helper uses the Helper step snippet and a prompt file in `references/agents/`. The prompt file has no frontmatter, opens with a role header (what it may change, whether it is safe at lower effort, that it starts no helpers of its own) and ends with an Output section, so a helper run and an inline run return the same shape. The main session coordinates; a shared prompt file has one owner skill and registered copies.

## Keep SKILL.md under 8,000 bytes

The whole file, frontmatter included, loads each time the skill runs, and Codex cuts it off at 8,000 bytes. Move phase procedures, flag tables and worked examples into `references/` files the skill loads when it reaches them. Keep inline what every run needs: always-executed steps and the action behind each menu option. Could an agent that skips the reference still finish the skill correctly? If not, that content stays inline. Layout rules, flowcharts and script-first design: `references/skill-architecture.md`.

## Test before you write

Watch a baseline fail first. Without seeing what an agent does with no skill, you cannot tell whether the skill teaches anything, so this holds for edits as well as new skills.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

The helper's prompt is the pressure scenario you wrote, following `testing-skills-with-subagents.md`; its input is whether the skill is loaded.

1. **Red.** Run the pressure scenarios without the skill. Record the choices and the rationalizations, word for word.
2. **Green.** Write the smallest skill that answers those failures. Run the same scenarios with it; the agent now complies.
3. **Refactor.** Each new rationalization gets a counter and a rerun, until the scenarios pass.

Test shapes by skill type, bulletproofing a discipline skill, and the rationalizations people use to skip testing: `references/testing-and-bulletproofing.md`. To measure trigger reliability, a host's own evaluation runner helps where one exists (Claude Code: `claude plugin eval`; same reference, § Native runner).

## Finish one skill before the next

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, create `.agent-blueprint/.gitignore` with the lines `run/`, `team/`, `review-runs/` and `cache/` if it does not exist yet, so run state stays out of commits while plans and notes stay tracked.

**Tracking tasks.** The plan file's checkboxes are the record of progress: tick each one when its task is done and verified, so another session or another tool can continue from there. A host task list, if you have one, may mirror them, but it never replaces them.

Copy the checklist in `references/skill-template.md` § Skill Creation Checklist into `.agent-blueprint/plans/<skill-name>-skill.md` as that file's checkboxes, and delete the file once every box is ticked and the final run is clean. Testing each skill before starting the next keeps one skill's gaps from spreading into the rest.

In this repository, run the gates before you commit: `python3 scripts/check-portability.py`, `python3 scripts/sync-shared.py --check`, `python3 scripts/check-skill-collisions.py` and `python3 -m unittest discover -s tests/gates`. Elsewhere, check the same rules against `references/portable-authoring.md`.
