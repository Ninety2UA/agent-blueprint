# Host notes

Loaded on demand from SKILL.md when running in Claude Code, or when a research sweep may hit a helper or search limit.

## Not the bundled workflow

Claude Code ships its own deep-research workflow, a web-search fan-out that starts only when invoked manually (CLI 2.1.218). This skill is the five-helper research swarm in SKILL.md; its `ab-` name keeps the two apart in every tool's skill list.

## Session caps

Claude Code no longer caps subagents per session (the 200-subagent total was removed in CLI 2.1.224). What applies now is a concurrency cap of 20 subagents by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, 2.1.217) and a nesting depth of 3 by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, 2.1.219); WebSearch stays at 200 per session. A standard research swarm (5 helpers) stays well within all three, but any subagent a researcher spawns itself counts against the depth-3 default, and large or repeated sweeps in one session should still track cumulative search usage.
