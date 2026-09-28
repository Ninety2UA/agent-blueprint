# Capability snippets

The five steps that depend on what the host can do, each worded once. The paragraph right under each heading is the snippet. A skill pastes it as a paragraph of its own, byte for byte, and puts anything specific to its site (which prompt file, which inputs, which default) in the next paragraph. `python3 scripts/sync-shared.py` rewrites every copy from this file, and the portability gate fails on a copy that differs, so edit a snippet here and never in a copy.

## helper-step

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Use it wherever a skill hands work to a helper. The next paragraph names the prompt file and the inputs, for example:

```text
Prompt: references/agents/code-reviewer.md. Inputs: the review range and the plan path.
```

A step that starts several helpers at once uses the snippet once and lists every prompt file.

## asking-the-user

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Use it at every point where the skill waits for the user. The next paragraph gives the default, for example: "Default when nobody answers: keep the current plan."

## tracking-tasks

**Tracking tasks.** The plan file's checkboxes are the record of progress: tick each one when its task is done and verified, so another session or another tool can continue from there. A host task list, if you have one, may mirror them, but it never replaces them.

## lower-effort

**Lower effort.** This step is safe at lower effort. If your host lets you set effort for a single helper, you may start this one lower, unless the user asked for their level everywhere; otherwise it runs at the session's level. Never switch models to save effort.

Paste it only at steps that are safe at lower effort, such as mechanical checks and searches. The step's prompt file says the same in its role header.

## bundled-scripts

**Bundled scripts.** Paths such as `scripts/run.sh` are relative to this skill's own folder, the one holding its SKILL.md, not to the project. Run a script through its interpreter (`bash` for `.sh`; `python3`, or `python` if that is missing, for `.py`) instead of relying on its executable bit, and if the interpreter is missing, say so and stop that step.
