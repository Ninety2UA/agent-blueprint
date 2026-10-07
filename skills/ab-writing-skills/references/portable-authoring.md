# Portable authoring

How to write a skill that loads and runs in any of the eight tools Agent Blueprint supports (Claude Code, Codex CLI, Antigravity, Grok Build, Pi, Cursor CLI, Hermes, Amp). Loaded on demand from `SKILL.md`. Each rule below is one the portability gate checks, with the reason it exists; the gate's rule id is in brackets.

## How a skill reads

**Outcome first, then the smallest protocol, then judgment.** Open with what the skill produces and how the reader knows it is done. Then give only the steps that must happen in order, and leave the rest to the model's judgment with the reasons it needs. Current models follow a stated outcome well and follow long rule lists too literally: a skill that lists every case stalls on the case it did not list.

**Capability, then success contract, then fallback.** Name what the step needs ("a helper that runs in parallel", "a way to ask the user"), say what a finished step returns, and say what to do when the host lacks the capability. Tool names appear only as examples ("a subagent, such as Claude Code's Agent tool"). A step with no fallback is a step some host cannot run.

**Principles with reasons.** Write "Keep the PR under 400 lines, because reviewers stop reading after that" rather than "PRs MUST be under 400 lines". A reason lets the model apply the rule to a case you did not foresee; a bare ALWAYS or NEVER makes it follow the letter or stall. Rules that must hold every time (never commit a secret) belong in a test, a CI gate, a hook or a permission, not only in prose.

**No filler instructions.** Drop "think carefully", "be thorough" and similar lines: they cost bytes and change nothing. Keep an example only when it shows something the prose cannot, and keep one per pattern.

**Ask only where the skill must wait.** Every question point uses the Asking the user snippet and names the default a headless run takes. "Ask the user first" with no default stalls a literal-minded model, and hangs an unattended run.

## Frontmatter

- [frontmatter] Keys are the agentskills fields (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`) plus `argument-hint` and `disable-model-invocation`. Other tools ignore the two extras; claude.ai uploads and the Skills API reject any unknown key, so the list stays short. No `effort` and no `model`: either would override the model and effort the user chose.
- [name] `ab-` plus lowercase letters, digits and single hyphens, at most 64 characters, equal to the folder name. The prefix keeps the skills apart from other packs in the shared skill folders most tools scan.
- [description] 1 to 1,024 characters (Codex truncates the catalog there). Lead with what the skill does and how, then "Use when ..." with the situations that call for it. Tools such as Codex and Amp pick a skill from a short catalog line, so the mechanism has to come first. Keep it distinct from sibling skills; the collision gate fails near-duplicates.
- [manual-only] A skill only the user should start carries `disable-model-invocation: true` and `agents/openai.yaml` with `policy.allow_implicit_invocation: false`, the Codex equivalent. Several hosts also hide a manual-only skill from other skills, so no skill may name one. Amp and Hermes cannot enforce manual-only; keep its description free of broad trigger words.

## Body

- [size] The whole SKILL.md, frontmatter included, stays within 8,000 bytes. Codex truncates a skill there, silently.
- [slash-ref] Name other skills in prose, "use the `ab-writing-plans` skill", never with a slash. Hosts invoke skills differently (`/name`, `$name`, `/skill:name`, or only in prose), so a slash form is wrong in most of them.
- [banned-token] No argument placeholder (the ARGUMENTS token with its leading dollar sign), no host variables for paths or sessions (such as the Claude Code plugin-root variable), and no load-time command expansion. Each works in one host only. The host passes the user's request with the skill; read it from there.
- [path-escape] Stay inside the skill's folder: no link that climbs to a parent folder and no path into another skill's folder. Copy installs carry each skill folder on its own, so a path out of it breaks. Text two skills need goes into both, registered as a copy (below).
- [instructions-write] Never tell the agent to edit the project instructions file by name. Hermes quarantines a skill that says "update AGENTS.md", and session notes belong in `docs/context/STATUS.md` anyway. The one step that records learnings says "the project instructions file" and resolves it as AGENTS.md, then CLAUDE.md.
- Working folders the skill creates live under `.agent-blueprint/<purpose>/`, never under `.claude/`, which other tools treat as foreign.

## Text Hermes rejects

- [html-comment] No HTML comments in instruction, skill or prompt files. Hermes drops a whole context file that has one.
- [hermes-pattern] No phrasing Hermes reads as prompt injection or as a dangerous skill: phrases that tell the model to set aside its earlier instructions or to hide something from the user, role-hijack or command-and-control wording, invisible Unicode, `curl` or `echo` piped into a shell, reads of secret files, and similar. To describe an attack, paraphrase it; to install something, point at the tool's own installer instead of a pipe into a shell.
- [instructions-length] The root and template AGENTS.md stay within 200 lines, the length current guidance gives for instruction files that load in every session.

## Shared text

- [snippet-drift] The five capability snippets live in `references/capability-snippets.md`. Paste a snippet as a paragraph of its own, byte for byte, and put the site's details in the next paragraph. Never edit a copy: edit the owner and run `python3 scripts/sync-shared.py`.
- [copy-drift] A file several skills need (a prompt file, the name map) has one owner and byte-identical copies, registered in `scripts/prompt-owners.json` and rewritten by the same tool.
- [owner-missing] Every registered owner and copy location exists; a removed skill cannot own shared text.

## Prompt files

Helpers get their instructions from prompt files in the dispatching skill's `references/agents/`. A prompt file has no frontmatter [frontmatter]. It opens with a short role header (what it may change, whether it is safe at lower effort, and that it never starts helpers of its own, since many hosts forbid nested helpers) and ends with an Output section, so a helper run and an inline run return the same shape. The main session coordinates; no prompt file dispatches.

## Repository layout

- [stray-skill-md] No file named SKILL.md outside `skills/<name>/`. The whole repository installs as the plugin, and recursive installers would pick a stray one up as a skill. Test fixtures use SKILL.fixture.md.
