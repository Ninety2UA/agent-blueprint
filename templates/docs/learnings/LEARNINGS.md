# Key Learnings

Project-specific patterns, gotchas, and insights discovered during development. Updated by `/session-wrap` at the end of each session.

**Rules:**
- Only add learnings that will matter in future sessions
- Keep entries to 2-4 sentences with specifics (file paths, commands, error messages)
- If a learning invalidates a previous entry, update rather than adding a contradiction
- If conventions were established, also update `docs/context/CONVENTIONS.md`

<!-- Append dated entries below this line -->

### 2026-03-26: `claude --print` buffers output — use `--verbose` with `tee` for live streaming
`claude --print` buffers all output until the process completes. `--output-format stream-json` requires `--verbose` and adds JSON parsing complexity. The simplest approach for `scripts/ship.sh` is `claude --print --verbose | tee "$OUTFILE"` — streams text to terminal in real-time while saving for completion detection. Background the process and run a spinner that reads the output file for stage detection.

### 2026-03-26: `read -p` inside `find | while read` steals pipe bytes — use `</dev/tty`
When `find | while read -r file` is running, any `read -p "prompt"` inside the loop reads from the find pipe, not the terminal. With `read -n 1`, it steals exactly 1 byte (the leading `/` of the next path), producing a corrupt relative path like `var/folders/...`. Fix: `read -p "prompt" -n 1 -r </dev/tty`. This also affects `curl | bash` installs where stdin is the download stream.

### 2026-03-26: CLAUDE.md should be stable instructions, not a growing journal
Key Learnings accumulated ~200 lines of historical analysis notes (38% of the file). These are journal entries, not actionable instructions — the patterns they produced are already embedded in the skills/agents they informed. Moved to `docs/learnings/LEARNINGS.md`. CLAUDE.md went from 527→149 lines. Rule: CLAUDE.md = stable behavioral rules + architecture + commands; learnings and status go in dedicated files.
