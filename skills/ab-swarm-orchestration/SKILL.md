---
name: ab-swarm-orchestration
description: "Starts several read-only specialist helpers at once on the same input, each on one dimension such as quality, security, performance or a research angle, then hands all their outputs to a synthesizer that merges them into one report. Use when a thorough review, research, analysis or audit needs several perspectives on one problem, or to compose a custom swarm such as a migration or architecture review. The standard review and research swarms run through ab-review-swarm and ab-deep-research, which carry their prompt files. Not for tasks that modify shared state (ab-wave-orchestration) or when one perspective is enough (start a single helper)."
---

# Swarm Orchestration

A swarm is a group of specialist helpers started at the same time, each looking at the same input from its own angle, whose outputs a synthesizer merges into one report. Many focused passes catch more than one broad scan, because each specialist looks only for its own class of problem. The run is done when every member has returned and the synthesized report is with the user or the calling skill. Unlike the ab-wave-orchestration skill, which orders dependent tasks, a swarm's members do not depend on each other and change no files.

Use it for review swarms (reviewers on different quality dimensions), research swarms (researchers on different aspects), analysis swarms (different risk areas) and audit swarms (different compliance areas). Not when members would modify shared state (use the ab-wave-orchestration skill), when the tasks are sequential (use the ab-autonomous-loop skill), or when one perspective is enough (start a single helper). The swarm's shape is drawn in `references/swarm-guide.md` § Swarm Architecture.

## Step 1: Select the members

Decide which perspectives the task needs and which specialists provide them, and check `blueprint.local.md` for project-specific overrides. Pre-built review, research and custom swarms, with the skill that carries each member's prompt file: `references/swarm-guide.md` § Pre-Built Swarm Configurations. Size the swarm by `references/swarm-guide.md` § Scaling Guidelines, and weigh its cost by `references/swarm-guide.md` § Cost Awareness: for a small change, one code reviewer is usually enough.

## Step 2: Prepare the shared context

Every member gets the same base context: the code, diff or files to analyze; the project's conventions and standards; its own focus area; and one output format for all, so the synthesizer can merge the results.

## Step 3: Start every member at once

Every member starts from here, all at once, since starting them one after another gives up the speed that is the point of a swarm; a sibling skill's reviewer runs from its prompt file, because the ab-review-swarm skill cannot run a chosen subset of its reviewers. Members only read, and none starts helpers of its own.

**Helper step.** Start a helper (subagent) for this step if you can, with the prompt file named below (its absolute path when the helper can read it, else its full text) and the listed inputs; leave its model and effort at the session's. If you cannot start one, follow the prompt file yourself. Either way, return its Output section, and note which path ran in the run's provenance record if there is one.

Prompt: `references/agents/integration-checker.md` for the integration checker; for a member another skill carries, that skill's prompt file for the member, in the agents folder under its references, next to this skill's folder (`references/swarm-guide.md` § Pre-Built Swarm Configurations names the skill for each member); for a member with no prompt file, the task packet below, one per member. Inputs: the member's focus, the shared context from Step 2, and the one output format from Step 2 (findings as P1/P2/P3 with `file:line`, or the research shape for a research swarm).

```
[member]: [focus]. Context: [shared context]. Read only; start no helpers of your own. Report findings as P1/P2/P3 with file:line locations.
```

## Step 4: Collect results

Wait for every member to return before acting on any result: the synthesizer needs all the outputs, and a partial set skews its report.

## Step 5: Synthesize

Hand every output to one synthesizer: the ab-review-swarm skill's findings-synthesizer prompt file for findings-shaped output, which is what the integration checker and the deployment verifier return too; the ab-deep-research skill's research-synthesizer for a research swarm. It removes duplicates, resolves contradictions and produces one report. Raw outputs from several members repeat each other and bury the findings that matter, so a swarm always ends in a synthesis.

## Step 6: Act on the results

Present the synthesized report and offer the next step.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: for review findings, fix them with the ab-resolve-in-parallel skill; for research findings, go on to the ab-writing-plans skill; or stop here. Default when nobody answers: stop and return the report for the calling skill or the user to act on.

Common mistakes: `references/swarm-guide.md` § Common Mistakes. How swarms differ from team work in the ab-orchestrate skill: `references/swarm-guide.md` § Swarms vs Team Work.
