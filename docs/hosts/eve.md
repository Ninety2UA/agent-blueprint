# Agent Blueprint on Eve

The hosted option, not a coding CLI: an agent built on Vercel's Eve framework (`eve` 0.86.0, pinned in `eve/package.json`) that you deploy to your own Vercel account, Railway or server. Facts from Eve's docs at that version and the units that built `eve/`, checked on local Docker on 2026-10-29; the Vercel Sandbox, Daytona and Railway routes and every live model call wait for the release run (see Smoke status).

## Install

Nothing installs on your computer, and `bash install.sh --only eve` refuses with a pointer to the [Hosted page](https://agent-blueprint.dbenger.com/hosted) and [`eve/README.md`](../../eve/README.md). A copy is deployed instead, by one of three routes:

- **Vercel**, the guarded route: the Hosted page's button, or `npm run deploy` in `eve/` of your clone. Vercel runs the agent, the web chat, the workflow store and the sandboxes. Hobby suits short runs and the discovery check, because a sandbox session there lasts 45 minutes; a full pipeline run needs Pro.
- **Railway**, unguarded: the template builds `eve/Dockerfile` with Daytona as the sandbox and Postgres as the workflow store. `DAYTONA_API_KEY` must be set before the first build.
- **Your own server**, unguarded: `npm ci`, `npm run build` and `npm start` in `eve/`, with Docker or Daytona as the sandbox.

Before any route you need a GitHub App installed on the one repository the agent works on, AI Gateway access with credits, and the variables of the channel you choose; `eve/README.md` lists them in order. Check a copy with `curl https://<your-deployment>/eve/v1/health`, which answers ready without a credential.

How the skills reach Eve: the agent reads the plugin's `skills/` folder in place. `eve/agent/skills/` holds one generated module per skill that reads `skills/<name>/` when the agent is built, so no skill text is copied, and the build fails unless Eve sees every skill (`node eve/scripts/check-skill-count.mjs`).

Update: a running copy moves to a new release by the upgrade route in [`eve/README.md`](../../eve/README.md#upgrade): merge the release tag into your clone, set `AB_MAINTENANCE` so no new work starts, end the open sessions with their work on their branches, back up the run store off Vercel, deploy, check health, then clear the variable. On Railway and your own server a change of Eve's version strands any session still open, which is why the open sessions end first; on Vercel each run stays on the deployment that started it. The ab-plugin-update skill does not apply here (below).

## Invoke a skill

- By description: the agent loads a skill when the request matches its description, as in the CLIs.
- Explicit: name it in the message, for example "Use the ab-brainstorming skill.", the form the smoke cells use.
- Start with the repository: the first message names a github.com repository, and the agent clones it with its `clone_repository` tool before anything else. A private repository is cloned with a read-only token for that repository alone.
- Manual-only: enforced. `ab-migrate` and `ab-plugin-update` are offered only after the latest message names one, so a matching request alone never loads them. The permission lasts through checkpoint replies and a compaction, and ends when a later turn fails or is cancelled, or when a later message names another skill.

## Model and effort

Set per role, not per session. `AB_ROSTER` picks the preset (`quality`, the default, or `budget`), and `AB_MODEL_<ROLE>` and `AB_REASONING_<ROLE>` change one role's AI Gateway model id or reasoning level. The roles are lead, planner, builder, reviewer, tester, analyst and documenter; [`eve/README.md`](../../eve/README.md#roster) has each one's model. The lead is the agent you talk to and is read at build, so changing it needs a new deploy. Helpers run through the `helper` tool, each on the model and reasoning level of the role it is briefed for, read when the helper starts. A model the Gateway does not serve fails the turn with the id in the message; no other model is tried.

## What is missing or different

- **Degraded skills.** Every other skill behaves as it does in a CLI. These five load and run, but cannot do all of their work here:
  - `ab-plugin-update` upgrades a plugin installed in a coding CLI. An Eve copy has no plugin install to find; it is upgraded by redeploying it (Install, above), so the skill finds nothing to update.
  - `ab-forensics` reads the ship runner's iteration logs, which a CLI run keeps under `~/.local/state/agent-blueprint/`. An Eve run writes none: its events live in Eve's session stream and, on Vercel, under the project's Observability, which the agent cannot read from its sandbox. A later session also starts in a new sandbox, so the skill works from the pushed branch's history and the run state that `publish_branch` restores from the run's record.
  - `ab-browser-testing` needs a browser automation tool, and the agent has none. It takes the skill's own path for that case: it starts the dev server if it can and lists the checks to run by hand.
  - `ab-deployment-verification` checks a deployment's configuration, migrations, monitoring and rollback plan. The sandbox reaches only GitHub and the allowed hosts, not your environments, dashboards or secrets, so the verdict rests on the repository's evidence and names what it could not check.
  - `ab-health-check` runs the project's build, test, lint and dependency commands from `docs/context/CONVENTIONS.md`. The sandbox is Eve's default image with `git`, `gh` and `python3` added; a project that needs another toolchain, a database or a registry outside the allowed hosts gets those areas reported as not run.
- **Hooks become tool wrappers and policies.** Eve has no hook files, so each hook effect moved into the tool it watched:
  - Write-time injection guard (`prompt-guard.js`): the `write_file` wrapper returns the same warning in the result's `advisory`. On the demo, writes under `.github/` are denied.
  - Read-time scanner (`read-injection-scanner.js`): the `read_file` wrapper puts the same banner before the content. Images and PDFs are not scanned.
  - Commit-message check (`validate-commit.js`, opt-in and advisory in the CLIs): the `bash` wrapper's policy denies a commit whose message fails, on every copy.
  - Fetch cache (`sdd-cache-pre.sh` and `sdd-cache-post.sh`): the `web_fetch` wrapper, with the same key and folder under `.agent-blueprint/cache/sdd/`.
  - Push and pull request from the shell (no CLI hook): the `bash` policy denies `git push` and `gh pr create` and names the `publish_branch` tool, the only way out of the sandbox.
  - Session-start pointer (`session-start.js`): the agent's instructions say to read `docs/context/STATUS.md` first.
  - Context monitor (`context-monitor.js`): an observer that logs every compaction with the history size. Nothing reaches the model, so the CLIs' tool-call and read-streak warnings are absent.
  - Ship-pipeline Stop guard (`ship-loop.sh`): the `ship_pipeline` tool, which the agent calls again after each iteration until the run stops; see Unattended runs.
  - Agent Teams gates (`teammate-idle.js`, `task-completed.js`): not ported, because Agent Teams exist only in Claude Code.
  - The scanners warn; what contains a run is the credential window, the shell's push denial and the publish tool's refusal of workflow files.
- **Publishing.** `publish_branch` pushes the run's own branch (`ab/<feature>-<session>`) at every stage change and opens a draft pull request at the end, after a secret scan of the outgoing commits and the body. A change under `.github/workflows` or `.github/actions` needs a person on an interactive channel and is refused on an unattended run and on the demo. On an interactive channel it asks before it opens the pull request.
- **Questions.** `ask_question` shows a checkpoint as a question in the web chat, a Slack card with buttons, an elicitation in the Linear agent session, Telegram buttons or a message to reply to, or an `input_required` state that an MCP client answers with `agent_update`. An unattended run takes each skill's documented default.
- **Channels.** Linear, Telegram and MCP reach the same agent as the web chat and Slack, each behind its own check: Linear's webhook signature, a Telegram user list that admits nobody until filled, and an MCP token or an allowed OAuth subject. Linear works in public teams; private teams were not checked. A repeated Linear or Telegram delivery starts no second run. Uploads are not read on any channel. Everyone who holds the MCP token is one user. Claude Code with the token and Claude.ai with OAuth sign-in each ran to a draft pull request on Vercel and on Railway; ChatGPT has not been run live. A Linear Stop cancels the run's turn. It was checked live while a run worked, and against a mocked Linear while the run waits on an approval. `eve/README.md` has each channel's steps and limits.
- **Helpers.** The `helper` tool briefs a fresh copy of the agent on one task, sharing the sandbox but not the conversation, on its role's model. Team work runs through the `ab-orchestrate` ledger; Agent Teams are not available.
- **Compaction.** Eve cuts a loaded skill's body to 2,000 characters when it compacts the history, so the agent loads the active skill again after a compaction.
- **The unguarded tier, per provider.** The GitHub token reaches git differently on each sandbox provider (the provider matrix in `eve/README.md`):
  - Vercel Sandbox (guarded): the token travels as a header the sandbox's network adds to requests to `github.com` only while a clone or push runs. No process in the sandbox ever sees it. The network is a domain allowlist of GitHub plus the allowed hosts.
  - Docker (unguarded): each git command reads a token minted for it from a file that is removed when the command ends. It never enters the session's environment or the remote URL, but another process in the sandbox could read the file while that command runs. Docker cannot list hosts, so the network is allow-all or deny-all.
  - Daytona (unguarded): the same file route as Docker. The network is a domain allowlist on Daytona tiers 3 and 4; tiers 1 and 2 keep the organisation's own policy.
  - On every provider the token is limited to the one repository and expires within an hour, and every credentialed git command ignores the repository's own hooks and credential helpers. Unguarded means that code running in the sandbox during a push could use that token on that repository while it lasts.
- **Rulesets on private repositories.** Protect the repository's default branch with a ruleset that blocks deletion and force-push and requires a pull request before merging, and keep the GitHub App off its bypass list. GitHub enforces rulesets on a private repository only on a paid plan (Pro, Team or Enterprise). Without one, nothing on GitHub stops a token with contents write from pushing to the default branch: the agent stays off it because `publish_branch` pushes only the run's own branch and the shell's push is denied, and on Docker and Daytona the token is readable as described above.
- **Instructions.** The agent's own instructions (`eve/agent/instructions.md`) come first; the repository's `AGENTS.md` and `docs/context/` are read from the clone like any other file.
- **Durability.** On Vercel a session survives a sandbox that stopped at its limit: the next step resumes it with its files. Off Vercel the workflow store is Postgres (Railway) or a folder on disk, and a Daytona sandbox that stopped is started again on the next turn.

## Unattended runs

The ship runner (`skills/ab-ship-pipeline/scripts/run.sh`) drives the CLIs and has no Eve row. An unattended run starts over HTTP with the project's Vercel OIDC token and says it cannot answer questions:

```bash
curl -X POST "https://<your-deployment>/eve/v1/session" \
  -H "Authorization: Bearer $VERCEL_OIDC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Work on https://github.com/<owner>/<repo>: <the feature>","capabilities":{"requestInput":false}}'
```

Posture comes from the caller, never from the message: a person in the web chat, Slack, Linear, Telegram or an MCP client is interactive; a token that names a service, such as the project's OIDC token or a schedule, is unattended, takes each skill's documented default and opens the pull request without asking. The posture is recorded in the run's decisions. Off Vercel there is no OIDC token: a Railway or own-server copy is reached through Slack, Linear, Telegram or MCP, or over HTTP with a cookie made from `EVE_CHAT_PASSWORD` as `eve/README.md`'s upgrade step 4 shows.

`ab-ship-pipeline`'s loop of fresh sessions, the counterpart of the runner's iterations, runs through the `ship_pipeline` tool. Each call counts one iteration in the run's record, reads `.agent-blueprint/run/state.json` and returns a brief that a fresh helper runs in the role its stage needs, until the run is done, blocked, needs a person or reaches its ceiling (10 iterations unless the call sets another, at most 20). Each stage is pushed to the branch as it finishes, and every stop but done pushes the branch too. A crash inside a helper or inside a tool counts as one iteration and the loop goes on, but on Eve 0.86.0 a failed turn of the lead agent itself (a provider refusing the lead's own model call, for example) ends the session and its record. The pushed branch is then the recovery point: `publish_branch` mode `restore` in a new session finds no record there and does not adopt another session's branch, so a person restarts the run from that branch.

## Privacy

Model calls go through the Vercel AI Gateway to the provider of each role's model, under your Gateway account's terms. The sandbox provider (Vercel, Docker on your server, or Daytona) holds the clone while a session runs, and the workflow store (Vercel Workflow, Postgres or the local folder) keeps the session's history. The web chat keeps chats in the browser. A run started from Slack, Linear or Telegram also leaves its messages on that platform, under its terms. Operational memory is off outside Vercel and, on the demo, scoped to one session. The web chat's login route logs the status code, never the password.

## Paths to avoid

- `eve/.eve/`, `eve/.output/` and `eve/node_modules/` after a local build: they hold compiled copies of every `SKILL.md`. Install a CLI only from a clean clone or worktree, or a tool may list skills twice.
- `eve/agent/skills/*.ts`: generated. After adding, renaming or removing a skill, run `python3 eve/scripts/emit-skill-modules.py`, never edit them by hand; `manual-only.ts` is the one hand-written file there.
- The GitHub App on a ruleset's bypass list, or installed on more than the one repository.
- `.claude/`: the agent keeps its working files under `.agent-blueprint/`, as in the CLIs.

## Smoke status

From the v4.2.0 smoke table ([docs/releases/v4.2.0-smoke.md](../releases/v4.2.0-smoke.md)), host version eve 0.86.0, last cell 2026-11-04.

| Cell | State | Time | Reason |
|------|-------|------|--------|
| `discovery` | pass | 1s | mock run (scripted model, no tokens spent, docker sandbox): 5 of 5 gates passed |
| `canary` | pass | 11s | 5 of 5 gates passed |
| `hooks` | pass | 5s | mock run (scripted model, no tokens spent, docker sandbox): 32 of 32 gates passed |
| `manual-only` | pass | 4s | mock run (scripted model, no tokens spent, docker sandbox): 18 of 18 gates passed |
| `build` | pass | 9m51s | 6 of 6 gates passed |
| `helpers-off` | n/a |  | no switch turns helpers off on Eve, so the inline path cannot be forced; the cell is n/a on hosts without one |
| `effort` | n/a |  | Claude Code only: the cell reads the effort field of Claude Code's helper transcripts |
| `review` | pass | 2m25s | 4 of 4 gates passed |
| `debug` | n/a |  | not one of Eve's smoke cells (KTD15: the live tier is canary, build, review and ship); ab-systematic-debugging loads from the same committed skills/ tree the discovery cell checks |
| `tdd-override` | n/a |  | not one of Eve's smoke cells (KTD15: the live tier is canary, build, review and ship); ab-test-driven-development loads from the same committed skills/ tree the discovery cell checks |
| `brainstorm-override` | n/a |  | not one of Eve's smoke cells (KTD15: the live tier is canary, build, review and ship); ab-brainstorming loads from the same committed skills/ tree the discovery cell checks |
| `ship` | pass | 8m49s | 4 of 4 gates passed; the skill-load gate rescored as calledTool(ship_pipeline) from this run's record (ruling 97); draft pull request #15 |
| `team` | n/a |  | Claude Code only: Agent Teams exist only there; helpers on Eve are root copies through the helper tool |
| `upgrade` | n/a |  | Claude Code only: the cell upgrades a v3.8.0 Claude Code plugin install; an Eve copy is upgraded by redeploying it |
