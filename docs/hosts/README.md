# Host support notes

Agent Blueprint runs its 53 `ab-` skills in eight coding CLIs. Each note below covers one host: how to install through that host's single route, how to invoke a skill, where model and effort are set, what the host lacks or does differently, how the ship runner drives it unattended, what to know about privacy, which paths to leave alone, and its status in the v4.0.0 smoke test. The skill files are the same everywhere; only the install route, the invocation form, the helper tool and the hooks differ. A host that fails the smoke test through a vendor bug ships marked degraded in its note, with the upstream link.

| Host | Binary | Install route | Hooks | Helpers | Manual-only enforced | Headless posture |
|---|---|---|---|---|---|---|
| [Claude Code](claude-code.md) | `claude` | `claude plugin marketplace add`, then `claude plugin install` | yes (10 handlers) | yes | yes | `-p --permission-mode auto` |
| [Codex](codex.md) | `codex` | `bash install.sh` (the `~/.agents/skills` copy); the plugin route instead on a Codex-only machine | with the plugin route (5 handlers) | yes | yes | `exec -s workspace-write`, network on, `.git` read-only |
| [Antigravity](antigravity.md) | `agy` | `agy plugin install <checkout>` | no | yes | not verified | `-p --dangerously-skip-permissions` (unguarded) |
| [Grok Build](grok-build.md) | `grok` | one copy in `~/.agents/skills` (`install.sh`) | no | yes | yes | `-p --always-approve --sandbox workspace` |
| [Pi](pi.md) | `pi` | one copy in `~/.agents/skills` (`install.sh`) | no | with `pi-subagents` | yes | `-p --approve` (unguarded) |
| [Cursor CLI](cursor-cli.md) | `cursor-agent` | one copy in `~/.agents/skills` (`install.sh`) | no | yes | yes | `-p --force --sandbox enabled --trust` |
| [Hermes](hermes.md) | `hermes` | the same copy, listed in `skills.external_dirs` | no | yes | no | `-z` one-shot, dangerous commands denied |
| [Amp](amp.md) | `amp` | a Claude Code install, else the same copy | no | yes | no | `-x` (unguarded) |

An unguarded host needs the ship runner's `--allow-unguarded` flag, and on such a host the agent holds the user's git and `gh` credentials for the run. The smoke table (`docs/releases/v4.0.0-smoke.md`) fills each note's last section after the release run.
