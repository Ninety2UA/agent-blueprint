---
title: "Decision record: Agent Blueprint gets a hosted option on Vercel's Eve framework, in eve/, beside the eight coding CLIs"
date: 2026-10-29
category: scope-decision
cycle: eve-host
requirement: R18, R19, R20, R21
applies_when:
  - Someone counts Eve as a ninth host, or asks why the copy still says "eight coding CLIs"
  - Someone proposes copying skills into eve/, a symlink for eve/agent/skills, or a converter that writes skill text for Eve
  - A package is proposed for the Eve host and the question is where it may live
  - The portability gate or the smoke test reports SKILL.md files under eve/.eve/, eve/.output/ or eve/node_modules/
  - Someone asks why the Eve CI job holds no Gateway key, or wants it to run live evals
  - The helpers question comes back: root copies through the helper tool, or a generated subagent tree
tags: [scope-decision, eve, hosted, vercel, skills, dependencies, ci, portability, helpers]
---

# Agent Blueprint gets a hosted option on Eve, in eve/

> **Outcome (2026-10-29):** Agent Blueprint can run as a hosted agent on Vercel's Eve framework, from an `eve/` folder in the product that every user can deploy to their own Vercel account, Railway or server. Eve is the hosted option beside the eight coding CLIs, not a ninth counted CLI, and ships with version 4.2.0. It reads the committed skills in place: `eve/agent/skills/` holds one emitted reference module per skill, and no skill text is copied. Its packages live only in `eve/package.json`, its build output stays out of the plugin's gates, and its CI job runs mocked evals that spend no tokens. This record applies `docs/learnings/2026-10-portability-decision.md` and `docs/learnings/2026-10-site-rebuild-decision.md` to the new folder. Recorded per U2 of `docs/plans/2026-10-28-2249-feat-agent-blueprint-eve-host-plan.md`.

## Context

Agent Blueprint runs only inside a coding CLI, so a visitor has nothing to try and a reviewer nothing to open. Eve's agents are directories of the same parts the blueprint already has: instructions, skills, tools, hooks and subagents, with a sandbox for the shell and a durable session for a long pipeline. The harness changes from a terminal the user sits in to an agent the user deploys, and the skill files stay as they are.

Two records bind the work. The portability record keeps one shared tree of skills for every host, rejects converters that generate per-host copies, and prices a new host at "a manifest, a support note and a smoke row". The site record scoped the zero-dependency rule to the plugin and accepted that every install carries `site/`. The Eve host needs a place in both.

The directory shape was proved by a spike before this record was written (U1, `context/handoffs/agent-blueprint-eve-units/U1.md` in the ninety2 workspace).

## Decision

All of these were settled in the planning session or by the U1 spike.

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| What Eve is | The hosted option beside the eight coding CLIs | Counting Eve as a ninth CLI host | The film, the hero and about twenty hand-written lines say "eight coding CLIs" and stay true. R20 has the installer refuse `eve` with a pointer to the Hosted page |
| Where it lives | `eve/` in the product, published with it | A separate repository | One codebase produces the demo copy and every user's copy |
| How the skills reach Eve | Shape (a): `eve/agent/skills/<name>.ts`, one module per skill, each reading `skills/<name>/` (the `SKILL.md` and every sibling file) when the agent is built | Shape (b), a whole-folder symlink `eve/agent/skills` to `../../skills`; owned copies registered in `scripts/sync-shared.py` | Shape (a) keeps every Eve file out of the plugin's markdown tree, gives the manual-only resolver its home in the same folder and puts no symlink in the publish set. U1 passed all seven of its checks, so shape (b) was not needed and the copies fallback was never started |
| Who writes the modules | `eve/scripts/emit-skill-modules.py`, with `--check` refusing a missing, orphan, drifted or foreign file | Hand-written modules | A module without its folder, or a folder without its module, must never deploy silently |
| The count | `eve/scripts/check-skill-count.mjs`: the skills Eve discovers plus the manual-only ones equal `skills/*/SKILL.md`, name for name; it runs in `npm run build`, `npm run deploy` and CI | Trusting the build | A dangling reference or an excluded folder would otherwise ship a smaller agent with no error |
| Helpers | Provisional: root copies of the agent through the `helper` tool, pinned to the role's model and reasoning from the roster, sharing the parent's sandbox and skills. U5's generated subagent tree is built only if one live helper run fails once Gateway credits exist | Declared subagents generated from the 30 prompt files, now | U1 showed a root copy shares the sandbox, loads a named skill, and is pinned to the requested model. It could not yet show a pinned copy finishing a turn, because the Gateway refused every model on the free tier |
| Dependencies | `eve/package.json` and its committed lock file only, with `eve`, `ai` and `zod` pinned exactly and the chat template's production-only packages pruned | Anything in the root `package.json` | The root `package.json` is Pi's manifest, and Pi installs its dependencies on a git install |
| CI | A job on pull requests that touch `eve/`, `skills/` or `scripts/prompt-owners.json`, with read-only permissions, no Gateway key and mocked evals only | Live evals in CI; `pull_request_target` | A pull request from a fork must never reach a key or spend tokens. Live cells run once per release on the maintainer's machine |
| Version | 4.2.0 carries the Eve host | 4.1.2 or a later 4.2.x | Host lists live in plugin content, so a new host is a release |

## How the portability record applies

The portability record says a new host costs a manifest, a support note and a smoke row. Eve is not counted as a host, but the price holds:

- **The manifest** is the directory shape: Eve finds its skills as entries of `eve/agent/skills/`, so the emitted modules are Eve's manifest. They hold a skill name and a call to the reader, never skill text.
- **The support note** is `docs/hosts/eve.md`, in the outline of the other eight (R19).
- **The smoke row** comes from `eve eval` in two tiers: `mock` cells in CI and on local Docker, `live` cells once per release, converted into the release's smoke record as host `eve`.

The emitter is not the converter the record rejected. A converter rewrites each skill into a host's format and breaks when that format changes. The emitter writes one fixed line per skill folder, and the skill files are read as they are.

## The boundary

The plugin's files stay as the eight hosts load them (R20): no skill text, helper prompt, hook handler or gate rule changes for them. The `eve/` folder keeps its own files to itself:

- `eve/.gitignore` ignores `node_modules/`, `.eve/`, `.vercel/`, `.env*`, `apps/web/.next/`, `.output/` and `.workflow-data/`.
- `eve/Dockerfile.dockerignore` lists the same paths from the product root, plus `site/`, `docs/images/` and the ninety2 anatomy files, because the image for Railway and own servers builds from the product root.
- The product's markdownlint covers `eve/**/*.md`.
- After a local `eve info` or `eve build`, `eve/.eve/` holds a compiled copy of every `SKILL.md`, `eve build` writes a second copy under `eve/.output/`, and `eve/node_modules/eve` ships `SKILL.md` files of its own. `scripts/check-portability.py` and the smoke test's discovery counter skip exactly these three git-ignored folders, so a maintainer's build does not turn the gate red or count a skill twice. A clean clone has none of them.
- The install guidance stays as it is. `docs/app-AGENTS.md` already says to install locally only from a clean checkout or worktree, because the Codex route and the Antigravity copy take ignored files such as `site/node_modules`; the same rule keeps `eve/.eve/` out of an install.

## Consequences

Users of the eight CLIs get the same plugin. Every plugin install also carries the `eve/` source, which nothing in those hosts loads: about 70 KB today, half of it the lock file, and more as the subagent folders, the chat template and the evals land. The site record accepted the same cost for `site/`.

Someone who wants a hosted agent deploys `eve/` to their own Vercel account, Railway or server, chooses the models per role through the Vercel AI Gateway and pays their own model and sandbox costs. The demo instance is the maintainer's own deployment of the same folder.

The maintainer pays for: the module emitter and the count gate whenever a skill is added, renamed or removed (`python3 eve/scripts/emit-skill-modules.py`, then the check); Docker for local `eve build` and `eve eval`; a live eval run with real tokens before each release; and `eve/package.json` in the release ladder from 4.2.0.

## Verdicts

### Eve as a ninth counted host → **REJECTED**

It is the hosted option beside the eight. Product copy keeps "eight coding CLIs" (R18).

### Skill copies for Eve → **REJECTED**

Shape (a) passed the spike, so no copy exists. Copies would trip the `stray-skill-md` rule and list every skill twice in Codex and Antigravity installs. They stay the recorded fallback only if a later Eve release breaks shape (a), with a dated record before the first copy.

### Zero dependency → **KEPT for the plugin, scoped away from eve/**

The Eve host's packages are listed only in `eve/package.json`, as the site's are in `site/package.json`. No CLI host loads them; the gates stay standard-library Python.

### Install size → **ACCEPTED**

Every install carries `eve/`, as every install carries `site/`.

### Generated subagent tree → **NOT BUILT, pending one live run**

The helper tool over root copies stands until a live run with Gateway credits shows a pinned copy finishing a turn. If that run fails, U5 builds the generated tree and this record is updated.

### Tokens in CI → **REJECTED**

The CI job runs only `mock`-tagged evals on the scripted model, holds no Gateway key and never runs on `pull_request_target`.

## Net

The skills were already portable prose; Eve gets them as they are, through one emitted line per skill and a gate that counts them. The hosted option costs the plugin nothing it loads, costs every install a small folder it ignores, and costs the maintainer an emitter, a count gate, a mocked CI job and one live eval run per release. The eight CLI hosts are unchanged.
