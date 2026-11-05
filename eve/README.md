# Agent Blueprint on Eve

The hosted option: Agent Blueprint's skills as an agent built on [Eve](https://eve.dev/docs), deployed to your own Vercel account, Railway or server. [Pre-flight](#pre-flight) lists what to have ready, [Deploy](#deploy) the three routes and [Upgrade](#upgrade) how to move a running copy to a new release.

## How the skills reach Eve

The plugin's one `skills/` folder is the source. `agent/skills/<name>.ts` is one generated module per skill, which carries that skill's `SKILL.md` and its sibling files, so the built agent reads nothing from `skills/` when it runs; `python3 scripts/emit-skill-modules.py` writes the modules after any change under `skills/`, and its `--check` fails while one is out of date. The manual-only skills get no module of their own: they load only when the user names them.

```bash
python3 scripts/emit-skill-modules.py           # write the modules after adding, renaming or removing a skill
python3 scripts/emit-skill-modules.py --check   # change nothing; fail on a missing, orphan, drifted or foreign module
node scripts/check-skill-count.mjs              # fail unless Eve sees every skill in skills/
```

`npm run build` runs the count check before `eve build`, and a Vercel build runs it before the agent service builds.

## Pre-flight

Have these ready before you deploy a copy:

1. **A GitHub App for the one repository the agent works on.** The agent pushes branches and opens pull requests as this App, and it can reach no repository the App is not installed on.
   1. On GitHub, open **Settings**, **Developer settings**, **GitHub Apps**, **New GitHub App**. Give it a name and any homepage URL, and clear **Active** under **Webhook**.
   2. Under **Repository permissions** set **Contents** to read and write and **Pull requests** to read and write. **Metadata** becomes read-only on its own. Leave every other permission at no access.
   3. Under **Where can this GitHub App be installed?** pick **Only on this account**, then create the App.
   4. The App's page shows its **App ID**: that is `AB_GITHUB_APP_ID`. Under **Private keys**, generate a key; the whole downloaded `.pem` file is `AB_GITHUB_APP_PRIVATE_KEY`.
   5. Open **Install App**, choose your account, pick **Only select repositories** and select the one repository.
2. **Access to the Vercel AI Gateway.** On Vercel you need nothing to paste: choose the `oidc` gateway option and the project's own OIDC token reaches the Gateway (see [Vercel](#vercel)). Off Vercel, or to bill another team, create an API key at `https://vercel.com/<your-team>/~/ai/api-keys` (the team's AI Gateway tab, API Keys) for `AI_GATEWAY_API_KEY`. Either way the team needs AI Gateway credits for the roster's models, and a budget on the key or the team keeps a long run from spending more than you meant.
3. **A password for the web chat,** `EVE_CHAT_PASSWORD`, when you use the web chat.
4. **A Daytona account and API key,** `DAYTONA_API_KEY`, when the sandbox is Daytona (Railway always, your own server when you choose it). Create the key in the Daytona dashboard under **API Keys**.
5. **A Linear app,** when you use Linear. The deploy link asks for its three values, so create it first. If you do not know your deployment's address yet, enter the one you expect and correct both URLs on the app's page after the deploy, before you install the app.
   1. Open `https://linear.app/settings/api/applications/new` in your workspace. The name you give the app is the agent's name in Linear; the developer name and URL can be anything.
   2. Set **Callback URL** to your deployment's address, `https://<your-deployment>`, on Vercel, or to `https://<your-deployment>/eve/v1/linear/install` on Railway or your own server ([After the deploy](#after-the-deploy) says why), and turn **Client credentials** on.
   3. Turn **Webhooks** on, set their URL to `https://<your-deployment>/eve/v1/linear` and tick **Agent session events** and nothing else. Tick it before you install the app: turning it on later forces a new install.
   4. Leave the app private to your workspace, with **Public** off, and save: your deployment completes the install for whichever workspace approves it.
   5. Copy the client ID into `LINEAR_CLIENT_ID`, the client secret into `LINEAR_CLIENT_SECRET` and the webhook's signing secret, shown under **Webhooks** on the app's page, into `LINEAR_WEBHOOK_SECRET`.
6. **A new Telegram bot,** when you use Telegram. Never reuse a bot that another tool already polls or receives updates for: a bot token serves one consumer.
   1. Send `/newbot` to @BotFather and answer its questions. Its reply holds the bot token, `TELEGRAM_BOT_TOKEN`.
   2. In BotFather's Mini App, open **My Bots**, your bot, **Bot Settings**, **Threads Settings**. Turn **Threaded Mode** on and leave **Disallow users to create new threads** off.
   3. Send `/setjoingroups` to @BotFather, pick the bot and choose **Disable**, so nobody can add it to a group.
   4. Make the webhook secret with `openssl rand -hex 32` and keep it for the step after the deploy. It is `TELEGRAM_WEBHOOK_SECRET_TOKEN`.

   `AB_TELEGRAM_USERS` can stay empty until the bot tells you your id ([After the deploy](#after-the-deploy)).
7. **An MCP token,** `AB_MCP_TOKEN`, when you use MCP. Make it with `openssl rand -hex 32`. Claude.ai and ChatGPT sign people in through an identity provider instead, which you can add after the deploy.

## Variables

This table is the one list of the variables a copy reads. The configurator builds deploy links from it, and `agent/lib/env.ts` must match it (`evals/env-table.eval.ts` checks). "Prompted when" names the configurator choices that make a deploy link ask for the variable: `host`, `gateway` (`oidc`, the Vercel project's own token, or `key`, an AI Gateway API key), `sandbox`, `channel` and `preset`. A sensitive variable never has a default; `{preset}` is the preset you chose and `{sandbox}` is the sandbox you chose.

| Name | Description | Link | Prompted when | Sensitive | Default |
|---|---|---|---|---|---|
| `AB_ROSTER` | The roster preset, quality or budget, which sets the model and reasoning level of every role. | [roster](#roster) | `always` | no | `{preset}` |
| `AB_MODEL_<ROLE>` | Replaces one role's AI Gateway model id, for example AB_MODEL_REVIEWER. Roles: lead, planner, builder, reviewer, tester, analyst, documenter. | [roster](#roster) | `never` | no | none |
| `AB_REASONING_<ROLE>` | Replaces one role's reasoning level, for example AB_REASONING_TESTER=medium. | [roster](#roster) | `never` | no | none |
| `AI_GATEWAY_API_KEY` | An AI Gateway API key. On Vercel you can leave it out: the project's own OIDC token reaches the Gateway. | [docs](https://vercel.com/docs/ai-gateway/authentication) | `gateway=key` | yes | none |
| `AB_GITHUB_APP_ID` | The id of the GitHub App you created for this copy. | [pre-flight](#pre-flight) | `always` | yes | none |
| `AB_GITHUB_APP_PRIVATE_KEY` | The private key of that GitHub App, the whole PEM file. | [pre-flight](#pre-flight) | `always` | yes | none |
| `EVE_CHAT_PASSWORD` | The password the web chat asks for before it opens. | [pre-flight](#pre-flight) | `channel=web` | yes | none |
| `EVE_CHAT_PASSWORD_DIGEST` | The salted digest form of the web chat's code, used instead of EVE_CHAT_PASSWORD; the demo sets it. Make it with the one-liner under Demo gate. | [demo gate](#demo-gate) | `never` | yes | none |
| `AB_TRUST_PROXY` | Set it to 1 when a proxy that writes the x-forwarded headers sits in front of the web chat or the agent off Vercel, such as Railway's edge or your own nginx. Each reader takes the last value, the one that proxy wrote. The login limiter keys on x-forwarded-for, the Linear install takes its host from x-forwarded-host, and MCP takes the scheme and host from x-forwarded-proto and x-forwarded-host, so it answers behind a proxy that ends TLS. Leave it unset when callers can reach the server without the proxy. The Railway template sets it. | [your own server](#your-own-server) | `never` | no | none |
| `SLACK_BOT_TOKEN` | The bot token of your Slack app. | [docs](https://eve.dev/docs/channels/slack) | `channel=slack` | yes | none |
| `SLACK_SIGNING_SECRET` | The signing secret of your Slack app. | [docs](https://eve.dev/docs/channels/slack) | `channel=slack` | yes | none |
| `LINEAR_CLIENT_ID` | The client ID of the Linear app you create for this copy, with client credentials turned on and installed with actor=app. | [after the deploy](#after-the-deploy) | `channel=linear` | no | none |
| `LINEAR_CLIENT_SECRET` | The client secret of that Linear app. The agent mints its own 30-day token from the ID and secret and renews it before it expires. | [after the deploy](#after-the-deploy) | `channel=linear` | yes | none |
| `LINEAR_WEBHOOK_SECRET` | The signing secret Linear shows for your app's webhook; the agent refuses any Linear request not signed with it. | [after the deploy](#after-the-deploy) | `channel=linear` | yes | none |
| `TELEGRAM_BOT_TOKEN` | The token @BotFather sends when you create your bot with /newbot. | [after the deploy](#after-the-deploy) | `channel=telegram` | yes | none |
| `TELEGRAM_WEBHOOK_SECRET_TOKEN` | A secret you make with openssl rand -hex 32 and pass to setWebhook as secret_token; Telegram sends it back with every update. It needs 32 characters or more, and Telegram rejects base64 output. | [after the deploy](#after-the-deploy) | `channel=telegram` | yes | none |
| `AB_TELEGRAM_USERS` | The numeric Telegram user ids allowed to use the bot, separated by commas. Empty, it admits nobody; anyone not listed gets one reply an hour with their own id. | [after the deploy](#after-the-deploy) | `channel=telegram` | no | none |
| `AB_SANDBOX` | Where the agent's shell runs: vercel, docker or daytona. Unset, it is vercel on Vercel and docker elsewhere. | [sandbox](#sandbox) | `sandbox=daytona` | no | `{sandbox}` |
| `AB_ALLOWED_HOSTS` | Hosts the sandbox may reach besides GitHub, separated by commas. Docker cannot list hosts: there any value allows every host and an empty value blocks all. | [sandbox](#sandbox) | `never` | no | `registry.npmjs.org,pypi.org,files.pythonhosted.org` |
| `DAYTONA_API_KEY` | Your Daytona API key. The build needs it too, because it prepares the Daytona sandbox. | [pre-flight](#pre-flight) | `sandbox=daytona` | yes | none |
| `AB_WORKFLOW_SECRET` | The key the agent signs every message it queues in Postgres with; the queue route /.well-known/workflow/v1/flow refuses any request without a valid signature. Set it when the build sets WORKFLOW_TARGET_WORLD=@workflow/world-postgres; the agent does not start without it. It needs 32 characters or more (openssl rand -hex 32), no space or line break at either end, and the same value on every deployment that shares the database. The Railway template generates it. | [railway](#railway) | `never` | yes | none |
| `AB_MAINTENANCE` | Set it to any value while you upgrade: new sessions and answers to checkpoint questions get a maintenance message instead of starting work. Clear it when the upgrade is done. | [upgrade](#upgrade) | `never` | no | none |
| `AB_DEMO` | Set on Dominik's demo instance only; tightens the write policy and the caps. | [variables](#variables) | `never` | no | none |
| `AB_DEMO_REPOSITORY` | The demo's sample repository, as owner/name, which every demo request and the demo's cleanup work on. | [demo](#demo) | `never` | no | `Ninety2UA/agent-blueprint-sample` |
| `AB_CLEANUP_DRY_RUN` | Set it to any value and the demo's cleanup logs what it would close and delete and changes nothing. | [demo](#demo) | `never` | no | none |
| `AB_MCP_TOKEN` | The bearer token an MCP client such as Claude Code sends. Make it with openssl rand -hex 32; a value under 32 characters counts as unset. During a rotation, set the old and new values separated by a comma. | [after the deploy](#after-the-deploy) | `channel=mcp` | yes | none |
| `AB_MCP_OAUTH_ISSUER` | The issuer URL of the identity provider that signs people in from Claude.ai and ChatGPT, such as your WorkOS AuthKit domain. It must be an https URL. Set it for the build and at run time; a change needs a new build. | [web chat and channels](#web-chat-and-channels) | `never` | no | none |
| `AB_MCP_OAUTH_SUBJECTS` | The user ids (the provider's sub claim) allowed to use the agent over MCP, separated by commas; a single * admits everyone the provider signs in. Set it for the build and at run time; a change needs a new build. | [web chat and channels](#web-chat-and-channels) | `never` | no | none |
| `AB_MCP_OAUTH_RESOURCE` | The MCP address people type into their client, such as `https://agent.example.com/eve/v1/mcp`. Unset on Vercel, it is the production address followed by /eve/v1/mcp. Set it for the build and at run time; a change needs a new build. | [web chat and channels](#web-chat-and-channels) | `never` | no | none |

## Roster

`AB_ROSTER` picks the preset: `quality`, the default, or `budget`. `AB_MODEL_<ROLE>` and `AB_REASONING_<ROLE>` change one role and leave the rest of the preset as it is; an empty value counts as unset. The roles and their `quality` settings:

| Role | Model | Reasoning |
|---|---|---|
| lead, planner, builder | `anthropic/claude-opus-5.5` | high |
| reviewer | `openai/gpt-6-astra` | high |
| tester | `anthropic/claude-sonnet-5.5` | high |
| analyst | `anthropic/claude-sonnet-5.5` | medium |
| documenter | `anthropic/claude-haiku-5.5` | medium |

The roles and their `budget` settings:

| Role | Model | Reasoning |
|---|---|---|
| lead, planner, builder | `zai/glm-5.3` | high |
| reviewer | `deepseek/deepseek-v4.1-flash-1017` | xhigh |
| tester, analyst, documenter | `deepseek/deepseek-v4.1-flash-1017` | high |

The lead is the agent you talk to and is read at build, so a change to its variables needs a new build or deploy. Anthropic models run with the Gateway's automatic prompt caching. A model the Gateway does not serve fails the turn with the id in the message, and a helper's failure names its role as well; no other model is tried. An id the Gateway's catalog does not list fails `eve build` for the lead, with the id in the message.

## Sandbox

`AB_SANDBOX` picks where the agent's shell, files and git run: `vercel` (Vercel Sandbox, the default on Vercel), `docker` (the default elsewhere, which needs a running Docker daemon at build and at run time) or `daytona` (for Railway, container platforms and any server without Docker). The build records the choice, so changing it needs a new build.

- **Vercel Sandbox.** The build captures a snapshot with `git`, `gh` and `python3` installed. A session is opened for 45 minutes, the most the Hobby plan allows, and the clone tool gives it a full 45 minutes again each time it runs, up to your plan's maximum. Hobby suits short runs and the discovery check; a full pipeline run needs Pro. When a session stops at its limit, the next step resumes it with its files.
- **Docker.** The sandbox image is `agent/sandbox/Dockerfile`: eve's default image plus `gh`. eve builds it at `eve build`.
- **Daytona.** `eve build` creates a Daytona sandbox from eve's default image, installs `git`, `gh` and `python3`, and saves it as a Daytona snapshot; every session then gets its own sandbox from that snapshot, so `DAYTONA_API_KEY` must be set at build as well as at run time. A sandbox that stopped (Daytona stops idle ones after 15 minutes) is started again on the next turn with its files, and the sandbox is deleted when the session ends.

The network policy is set when a session's sandbox is created. `AB_ALLOWED_HOSTS` adds hosts to `github.com` and `api.github.com`; unset, it is the npm and PyPI registries, and set to an empty value, only the two GitHub hosts remain. Each provider applies it as far as it can, as the matrix below states. Daytona tiers 1 and 2 refuse a per-sandbox allow-list. On those tiers the agent creates the sandbox without one, under your Daytona organisation's network policy, and logs `[daytona] this Daytona tier refuses a per-sandbox allow-list; the sandbox runs under the organisation's network policy`. When the policy blocks all traffic and Daytona refuses that, the session stops with Daytona's error, and no sandbox opens without the block.

The agent clones the repository you name into the sandbox's workspace with its `clone_repository` tool. A public github.com repository is fetched without a credential. When GitHub asks for one, the repository is private: the agent mints a read-only token for that one repository from the GitHub App and fetches through it, and refuses, naming the repository, when the App is not installed there. How the token reaches git depends on the provider (the matrix's token route column). On Vercel Sandbox the token travels as a header the sandbox's network adds to requests to `github.com` while the fetch runs, so no process in the sandbox ever sees it. On Docker and Daytona, each git command reads the token from a file that is removed when the command ends; it never enters the session's environment or the remote URL, but a process in the sandbox could read that file while the command runs, which is why those providers are marked unguarded. Every git command that carries a token ignores the repository's own hooks and credential helpers, and remote URLs are rewritten without credentials before and after.

### Provider matrix

| Provider | Where it applies | Network policy | GitHub token route | Needs at `eve build` | Durable store | Tier |
|---|---|---|---|---|---|---|
| Vercel Sandbox | Vercel deployments, the demo | Domain allowlist with header transforms: GitHub plus the allowed hosts (registries by default, empty on the demo) | Credential window: the header is set only for the clone and the publish step | Nothing | Vercel Workflow | guarded |
| Docker | Your own server with a Docker daemon | Allow-all (allowed hosts set) or deny-all (empty) only; Docker cannot list hosts, so a deny-all sandbox cannot reach GitHub either | Minted per command, handed to one git process | A Docker daemon | Local world on disk, or Postgres | unguarded |
| Daytona | Railway, your own server, container platforms | Domain allowlist (GitHub plus the allowed hosts) and block-all on Daytona tiers 3 and 4; tiers 1 and 2 keep Daytona's organisation policy, which you cannot narrow per sandbox | Minted per command, handed to one git process; remote URL kept bare after a private clone | `DAYTONA_API_KEY` | Postgres (Railway) or local world | unguarded |

## Deploy

Three routes run the same code at the same Eve version: `eve` is pinned exactly in `package.json` with a committed lock file, and every `npx` command below names its version. Each route ends at the health route, `GET /eve/v1/health`, which answers `{"ok":true,"status":"ready",...}` without a credential.

### Plan tier and session limits

| Host | Sandbox | Session limit | What a full run needs |
|---|---|---|---|
| Vercel Hobby | Vercel Sandbox | 45 minutes per sandbox session | Short runs and the discovery check only |
| Vercel Pro | Vercel Sandbox | Longer than 45 minutes, up to the plan's maximum; the clone tool extends the session each time it runs | Pro, for any run over 45 minutes |
| Railway | Daytona | No session limit; Daytona stops a sandbox after 15 idle minutes and the next turn starts it again with its files | Daytona credits for the sandbox time |
| Your own server | Docker or Daytona | Docker: none. Daytona: as on Railway | A server that stays up for the run |

The pipeline pushes its branch at every stage change, so a sandbox that stops at its limit loses no finished stage.

### Vercel

Vercel runs the agent, the web chat, the workflow store and the sandboxes; this is the guarded route. `vercel.ts` composes the project with `withEve`: the web chat at `apps/web` and the agent's own service, whose build runs the skill count check first.

**With the button.** The configurator on the Hosted page builds the link from the [Variables](#variables) table. Vercel clones the repository into your GitHub account, creates a project whose root directory is `eve`, asks for the variables your choices need, then builds and deploys. Open the address it shows; the web chat asks for your password.

**Gateway access on Vercel.** With the `oidc` choice the link does not ask for `AI_GATEWAY_API_KEY`. Vercel gives every deployment a short-lived OIDC token for its project, and Eve sends it to the AI Gateway whenever `AI_GATEWAY_API_KEY` is unset, so the Gateway bills your Vercel team. Choose `key` to use an API key instead, for example one with its own budget.

**From your clone,** in `eve/`:

```bash
npm ci
npx eve@0.86.0 link                                 # create or link the Vercel project
npx vercel@65.3.1 env add AB_GITHUB_APP_ID production  # repeat for each variable your choices need
npm run deploy                                      # the skill count check, then eve deploy
curl https://<your-deployment>/eve/v1/health
```

### Railway

Railway runs the agent from `eve/Dockerfile`, with Daytona as the sandbox and Postgres as the workflow store. This route is **unguarded**: the GitHub token reaches one git process inside the sandbox, which another process there could read while that command runs (see the [provider matrix](#provider-matrix)).

**With the button.** The [Railway template](https://railway.com/deploy/agent-blueprint-railway) deploys two services, with the agent built directly from this repository:

- **agent**: built from the repository root (leave the service's root directory empty) with `RAILWAY_DOCKERFILE_PATH=eve/Dockerfile`. The Dockerfile sets `AB_SANDBOX=daytona` before `eve build`, because the build prepares the Daytona snapshot and Railway has no Docker daemon, so `DAYTONA_API_KEY` must be set before the first build. A build without it stops with `DAYTONA_API_KEY is not set; the Daytona sandbox needs it at eve build and at run time.` The template sets `WORKFLOW_TARGET_WORLD=@workflow/world-postgres`, `WORKFLOW_POSTGRES_URL=${{Postgres.DATABASE_URL}}`, `AB_WORKFLOW_SECRET=${{secret(64, "abcdef0123456789")}}` and `AB_TRUST_PROXY=1`. `WORKFLOW_TARGET_WORLD` is read at build time, when `eve build` fixes the workflow store into the output, so a change to it takes effect at the next build; the other three are read at run time. Railway's edge ends TLS and forwards plain HTTP with `X-Forwarded-Proto` and `X-Forwarded-Host`; without `AB_TRUST_PROXY`, MCP answers every request 403 `MCP endpoints require HTTPS except on loopback.` Every message the agent queues in Postgres carries a signature made with `AB_WORKFLOW_SECRET` over the queue's name and the message, never the secret itself, and the queue route `/.well-known/workflow/v1/flow`, which Railway makes public like every path, refuses any request without a valid one. The template also runs `npx --package=@workflow/world-postgres@5.0.5 bootstrap` as the pre-deploy command, checks `/eve/v1/health`, and sets `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` to 60, so a redeploy gives the old container a minute after SIGTERM before Railway stops it.
- **Postgres**: the database the workflow store keeps its runs in, with credentials the template generates.

Railway builds the agent from this repository until you eject it. To get your own repository, open the service's settings, find **Upstream Repo** under **Source** and press **Eject**, which mirrors it into your GitHub account. Until then Railway tells you when this repository's `main` changes, and you choose when to apply the update.

It asks for `AI_GATEWAY_API_KEY`, `DAYTONA_API_KEY` and the two GitHub App variables, and offers every channel's variables as optional. Fill in those of the channel you chose. The three `AB_MCP_OAUTH_*` variables, for signing in to MCP from Claude.ai and ChatGPT, are read at build as well (the Dockerfile declares them), so add them to the agent service before the build that should use them. So are `AB_ROSTER`, `AB_MODEL_LEAD` and `AB_REASONING_LEAD`, which fix the lead's model when the image is built; the helpers read the roster at run time.

**Without the button,** build the same image from the product root:

```bash
WORKFLOW_TARGET_WORLD=@workflow/world-postgres docker build -f eve/Dockerfile --build-arg DAYTONA_API_KEY --build-arg WORKFLOW_TARGET_WORLD \
  --build-arg AB_MCP_OAUTH_ISSUER --build-arg AB_MCP_OAUTH_SUBJECTS --build-arg AB_MCP_OAUTH_RESOURCE \
  --build-arg AB_ROSTER --build-arg AB_MODEL_LEAD --build-arg AB_REASONING_LEAD .
```

A `--build-arg` with no value takes the variable from your shell's environment, and one your shell does not set stays unset; without the three `AB_MCP_OAUTH_*` values, MCP takes `AB_MCP_TOKEN` only, and without `AB_ROSTER` the lead runs on the `quality` preset. Give the container the same roster values at run time. Run the image with `WORKFLOW_POSTGRES_URL` and `AB_WORKFLOW_SECRET` set; make the secret with `openssl rand -hex 32` and give every container that shares the database the same value. Without it the agent exits at start with a message that names the variable. BuildKit reads `eve/Dockerfile.dockerignore` beside the Dockerfile; the legacy builder sends the whole folder instead, and the Dockerfile removes local dependencies, build output and `.env` files before it installs.

### Your own server

Run the agent with Node 24 or later on a server you manage. With a Docker daemon on that server the sandbox is Docker; without one, use Daytona. The workflow store is Eve's local world under `eve/.eve/.workflow-data`, so keep that folder on a persistent disk, run one process, and back the folder up before an upgrade. Operational memory is off outside Vercel; nothing needs configuring for it.

```bash
git clone https://github.com/<you>/<your-copy>.git
cd <your-copy>/eve
npm ci
npm run build                            # with Docker: the daemon must be reachable here and at run time
PORT=3000 npm start -- --host 0.0.0.0
curl http://127.0.0.1:3000/eve/v1/health
```

Set the variables in the environment of both `npm run build` and `npm start`. To keep the runs in Postgres instead of the folder, build with `WORKFLOW_TARGET_WORLD=@workflow/world-postgres`, run `npx --package=@workflow/world-postgres@5.0.5 bootstrap` once with `WORKFLOW_POSTGRES_URL` set, and start with `WORKFLOW_POSTGRES_URL` set and `AB_WORKFLOW_SECRET` set to the output of `openssl rand -hex 32` (the agent does not start without it). For Daytona instead of Docker, set `AB_SANDBOX=daytona` and `DAYTONA_API_KEY` before the build, or build the Railway image and run it with the run store on a volume:

```bash
docker build -f eve/Dockerfile --build-arg DAYTONA_API_KEY \
  --build-arg AB_MCP_OAUTH_ISSUER --build-arg AB_MCP_OAUTH_SUBJECTS --build-arg AB_MCP_OAUTH_RESOURCE \
  --build-arg AB_ROSTER --build-arg AB_MODEL_LEAD --build-arg AB_REASONING_LEAD -t agent-blueprint-eve .
docker run -d -p 3000:3000 --env-file agent.env -v ab-workflow-data:/app/eve/.eve/.workflow-data agent-blueprint-eve
```

Put TLS and your domain in a reverse proxy in front, and forward both `/eve/` and `/.well-known/workflow/` without rewriting their paths. Set `AB_TRUST_PROXY=1` on the agent and have the proxy pass the `Host` header through and write the forwarded headers; without them MCP answers 403 `MCP endpoints require HTTPS except on loopback.` With nginx, inside the `location` that proxies to the agent:

```nginx
proxy_set_header Host $http_host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $http_host;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

With `AB_TRUST_PROXY` set, the agent takes these headers from any caller, so let only the proxy reach its port, for example `-p 127.0.0.1:3000:3000` with the proxy on the same machine. The web chat in `apps/web` is a separate Next.js service that Vercel deploys beside the agent; the Railway and own-server routes serve the agent's own routes only, so reach those copies through Slack, Linear, Telegram or MCP. MCP on Railway has not been checked on a live deployment yet.

### After the deploy

**Web chat:** nothing; open the address and enter the password.

**Slack:** the deploy sets `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` from a Slack app you create, in this order:

1. At [api.slack.com/apps](https://api.slack.com/apps), choose **Create New App**, **From scratch**, and pick your workspace.
2. Under **OAuth & Permissions**, add the bot scopes `app_mentions:read` and `chat:write`, plus `im:history` for direct messages and `files:write` for long replies.
3. Choose **Install to Workspace** and allow it.
4. Copy the **Bot User OAuth Token** into `SLACK_BOT_TOKEN` and the **Signing Secret** from **Basic Information** into `SLACK_SIGNING_SECRET`, then deploy again so the agent reads them.
5. Under **Event Subscriptions**, turn events on, set the Request URL to `https://<your-deployment>/eve/v1/slack` and wait for Slack to show it verified, then subscribe to the bot events `app_mention` and `message.im`. Under **Interactivity & Shortcuts**, turn interactivity on and set the same Request URL. Use the production address: Vercel's deployment protection answers Slack with a login page on preview addresses.
6. Slack asks you to reinstall the app after the scope and event changes; choose **Reinstall to Workspace**.

Mention the bot in a channel it has joined, or send it a direct message, to start a run.

**Linear:** install the app from [Pre-flight](#pre-flight) once, as the app itself. When Linear sends the browser back to your deployment, the agent completes the install itself. It then mints its own token from the client ID and secret and renews it before its 30 days run out, so there is no token to paste.

The callback URL depends on the host. On Vercel it stays `https://<your-deployment>`, where the web chat receives Linear's redirect. On Railway or your own server nothing answers at that address, so the app's callback (Linear calls it **Redirect URI** on the app's edit page) and the authorize link's `redirect_uri` are `https://<your-deployment>/eve/v1/linear/install` instead, the agent's own install address, URL-encoded in the link as `https%3A%2F%2F<your-deployment>%2Feve%2Fv1%2Flinear%2Finstall`. The agent builds the address it hands Linear from the host the browser asked for, so behind your own reverse proxy either pass the original `Host` header through or set `AB_TRUST_PROXY` and have the proxy send `X-Forwarded-Host`.

1. On the app's page, check that the callback URL is the one for your host and the webhook URL `https://<your-deployment>/eve/v1/linear`, both on the production address, and that **Agent session events** is the only webhook event ticked.
2. As an admin of the workspace, open this address in a browser, with your client ID and the URL-encoded callback URL filled in. Keep the scope exactly as written: the agent asks for the same scope set each time it mints a token, and Linear revokes every token of the app when that set changes.

   ```text
   https://linear.app/oauth/authorize?client_id=<client ID>&redirect_uri=<callback URL, URL-encoded>&response_type=code&scope=read,write,app:assignable,app:mentionable&actor=app&state=install
   ```

3. Linear's consent screen names the workspace and offers **All public teams** or **Only select teams**. Keep **All public teams** and approve. The browser then opens the callback URL, and the page says that Agent Blueprint is installed in your Linear workspace. If Linear refused, the page names Linear's error; open the address above again. If you pressed **Cancel** instead, the page says that nothing was installed; open the address above again when you want to install. If it says the Linear variables are missing, do step 4 first.
4. If the deploy did not ask for `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET` and `LINEAR_WEBHOOK_SECRET`, set them now and deploy again so the agent reads them.

To install the app again, for example after removing it, first open the app in Linear's **Settings**, **Applications** and choose **Revoke access** from its **⋯** menu: while the app is installed, the address above opens its settings and no consent screen. Then open the address above again and approve.

Delegate an issue to the app, or mention it in an issue, to start a run. Linear works in public teams. Private teams were not checked: Linear's documentation says a client-credentials token reaches all public teams.

**Telegram:** Eve does not register the webhook itself, so point the bot at your deployment, then add yourself to the list.

1. With `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET_TOKEN` exported in your terminal, register the production address and check it:

   ```bash
   curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" -H 'Content-Type: application/json' \
     -d "{\"url\":\"https://<your-deployment>/eve/v1/telegram\",\"secret_token\":\"$TELEGRAM_WEBHOOK_SECRET_TOKEN\",\"allowed_updates\":[\"message\",\"callback_query\"],\"drop_pending_updates\":true}"
   curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
   ```

   The first answers `"ok":true`. The second shows the URL, and after your first message no `last_error_message`.
2. Open a private chat with the bot and send it any message. Your id is not on `AB_TELEGRAM_USERS` yet, so the bot replies with your numeric Telegram user id, at most once an hour.
3. Put that id into `AB_TELEGRAM_USERS`, with more ids separated by commas, and deploy again.

In the bot's private chat, any message typed in the main view opens a new thread, and each thread is its own run with its own branch and budget, so start a new thread for each feature. `/start` and `/help` answer with a usage line. A checkpoint question arrives as buttons, or as a message to reply to.

**MCP:** the address is `https://<your-deployment>/eve/v1/mcp`. A client works through four tools: `agent_start`, `agent_get`, `agent_update`, which answers a checkpoint question, and `agent_cancel`. The agent's own tools and skills are not published. Two clients passed a live check against a Vercel deployment on 2026-11-02: Claude Code with the token and Claude.ai with OAuth sign-in, each run ending in a draft pull request. Both passed on Railway as well, on 2026-11-03 and 2026-11-04, and so did a Linear install at `/eve/v1/linear/install` with a run from a delegated issue. ChatGPT has not been run live. The setups below show where each client takes the address and the header.

With the token, from a client that sends a header:

- Claude Code, with the token exported in your shell: `claude mcp add --transport http agent-blueprint https://<your-deployment>/eve/v1/mcp --header "Authorization: Bearer $AB_MCP_TOKEN"`.
- A project's `.mcp.json`, which Claude Code fills from your environment, so the token stays out of the file:

  ```json
  {
    "mcpServers": {
      "agent-blueprint": {
        "type": "http",
        "url": "https://<your-deployment>/eve/v1/mcp",
        "headers": { "Authorization": "Bearer ${AB_MCP_TOKEN}" }
      }
    }
  }
  ```

- Cursor: an entry under `mcpServers` in `.cursor/mcp.json` with the `url` and the `Authorization` header.
- VS Code: an entry under `servers` in `.vscode/mcp.json` with `"type": "http"`, the `url` and the `Authorization` header.

With OAuth, for Claude.ai and ChatGPT, which sign a person in instead of sending a header:

1. Set up an identity provider. With WorkOS AuthKit, for example: in AuthKit's Connect configuration turn on **Dynamic Client Registration** and **Client ID Metadata Document**, and add a **Resource Indicator** of exactly `https://<your-deployment>/eve/v1/mcp`, with no trailing slash. The AuthKit domain, such as `https://<name>.authkit.app`, is the issuer, and each person's user id under **Users** (`user_...`) is a subject.
2. Set `AB_MCP_OAUTH_ISSUER` to the issuer, `AB_MCP_OAUTH_SUBJECTS` to the user ids you admit and `AB_MCP_OAUTH_RESOURCE` to the MCP address people type; on Vercel it defaults to the production address. The agent reads them at build and when the server starts, so deploy again: on Railway and your own server that means a new build with them set, which the `docker build` commands above pass. While any of them is missing or malformed, OAuth stays off and the log names the reason.
3. `https://<your-deployment>/eve/v1/oauth-protected-resource/mcp` should then answer with the MCP address as `resource` and the issuer in `authorization_servers`.
4. Add the MCP address as a custom connector: in Claude.ai under **Settings**, **Connectors**, **Add custom connector**; in ChatGPT under **Settings**, **Connectors**, **Advanced**, with **Developer mode** on, on a plan that allows custom connectors. Sign in as a listed user. The server refuses anyone who signs in but is not on the list. Claude.ai then shows its own error, "Connection issue: Couldn't connect to the server. Check that the URL points to a valid MCP server.", with a Reconnect button, in place of the server's message. To let that person in, find their user id in the deployment's logs on the line that starts `[mcp] refused a signed-in user not on AB_MCP_OAUTH_SUBJECTS:`, add it to `AB_MCP_OAUTH_SUBJECTS` and deploy again.

Another identity provider works when it passes six checks:

- Its issuer is an https URL, and that exact URL is in `AB_MCP_OAUTH_ISSUER`.
- Its access tokens name the MCP address you typed as their audience.
- It supports PKCE with S256.
- You list the subjects you admit. A single `*` admits everyone the provider signs in, so close sign-up before you use it.
- It serves OIDC discovery at the issuer and issues JWT access tokens signed with the keys it publishes. Opaque access tokens are refused.
- A client can get a client ID without you, through dynamic client registration or client ID metadata documents, or you register a client with the redirect address the MCP client documents.

For Linear, Telegram and MCP, as for Slack, use the production address: Vercel's deployment protection answers with a login page on preview addresses.

**HTTP:** on Vercel, call the session API with the project's OIDC token as the [Web chat and channels](#web-chat-and-channels) example shows; `npx vercel@65.3.1 env pull` writes the token to `.env.local`.

## Web chat and channels

These channels reach the same agent:

- **Web chat** (`apps/web`): Eve's chat template in its starter mode, with chats kept in the browser. The template's production mode (a database, Redis and Sign in with Vercel) is left out of this copy. The chat opens after the visitor posts the password, which is `EVE_CHAT_PASSWORD`, or its digest in `EVE_CHAT_PASSWORD_DIGEST`. Everyone who knows it is one shared user to the agent.
- **Slack** (`agent/channels/slack.ts`): set `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET`, and point your Slack app's event and interaction Request URLs at `https://<your-deployment>/eve/v1/slack`. A checkpoint question shows as a Slack card with its options as buttons. Without the two variables the route refuses every request.
- **Linear** (`agent/channels/linear.ts`): a member of a public team delegates an issue to the app or mentions it, and the run's progress, questions, approvals and result appear as activities in the issue's agent session, where a reply answers a question. Eve refuses any request to `/eve/v1/linear` not signed with `LINEAR_WEBHOOK_SECRET`, and the channel starts nothing while one of its three variables is missing. Each run is told which issue it came from, and asks which repository to work on when the issue names none.
- **Telegram** (`agent/channels/telegram.ts`): the people on `AB_TELEGRAM_USERS` message the bot in a private chat at `/eve/v1/telegram`; each thread is its own run, and a question arrives as buttons or as a message to reply to. Groups are ignored, an empty list admits nobody, and someone not on it gets at most one reply an hour with their own id. Every update, a button press included, must carry `TELEGRAM_WEBHOOK_SECRET_TOKEN` in Telegram's secret header.
- **MCP** (`agent/channels/mcp.ts`): an MCP client starts, reads, answers and cancels runs at `/eve/v1/mcp`, sending `AB_MCP_TOKEN` as a bearer or, once the `AB_MCP_OAUTH_*` variables are complete, signing in through your identity provider. A missing or wrong credential gets 401, under `eve dev` too, and a signed-in user who is not listed gets 403.
- **HTTP** (`agent/channels/eve.ts`): Eve's session API under `/eve/v1`. It admits the chat's session cookie, a Vercel OIDC token and, under `eve dev` only, the local developer. Nothing anonymous gets in: a request none of these recognise gets 401.

An unattended run, from a script, a cron job or another deployment, uses the Vercel OIDC bearer and says it cannot answer questions:

```bash
curl -X POST "https://<your-deployment>/eve/v1/session" \
  -H "Authorization: Bearer $VERCEL_OIDC_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Work on https://github.com/<owner>/<repo>: <the feature>","capabilities":{"requestInput":false}}'
```

The posture comes from the caller, never from the message: a person in the web chat, Slack, Linear, Telegram or an MCP client, or the eve CLI against a deployment, is interactive, so the agent asks at checkpoints and asks before it opens a pull request; a token that names a service, such as the project's own OIDC token or a schedule, is unattended, so the agent takes each skill's documented default and opens the pull request without asking. The posture is recorded in the run's decisions.

When a hook stops a run, the run fails, or its session ends, the Linear session or the Telegram chat says so and names the pushed branch when there is one, so the person can continue from it. An MCP client reads the end of a run with `agent_get`. On Dominik's demo (`AB_DEMO=1`) the Linear, Telegram and MCP routes start nothing, because the demo's caps count web-chat visitors only.

Limits of the Linear, Telegram and MCP channels:

- When Linear or Telegram sends a delivery again, it starts no second run and asks no question twice. The agent hands Eve a delivery key (Telegram's update id, or the Linear session and activity ids), and Eve ignores a key the session has already seen, up to its last 1,024 keys. Anything the agent sends before the run starts can still repeat: Telegram's typing indicator and its /start, /help and maintenance replies, and on Linear the maintenance message and a Stop's final response.
- Uploads and attachments are not read on Linear, Telegram or MCP, as on the web chat and Slack. A Linear upload's link stays in the message with a note that it could not be retrieved.
- A Linear **Stop** cancels the run's turn, whether it is working or waiting on a question or an approval, and posts one final response. It never answers the open question. A press while the run worked was checked on a live workspace; a press while it waits is proven against a mocked Linear.
- Linear works in public teams. Private teams were not checked.
- Each running instance of the agent mints its own Linear token and keeps it in memory. Linear allows an app up to 1,000 client-credentials tokens at once.
- Everyone who holds `AB_MCP_TOKEN` is one user to the agent and shares its invocations and memory, as everyone who knows the web chat's password is one user.
- An MCP client's own model reads each question and can answer it without asking you. The agent asks clients to show every question and approval to their user, and cannot make them.
- ChatGPT has not been run live as an MCP client.
- A change to `AB_TELEGRAM_USERS` takes effect at the next deploy, or the next start on your own server; a change to `AB_MCP_OAUTH_SUBJECTS` needs a new build.

## Demo gate

Dominik's demo instance sets `AB_DEMO=1`. It keeps the web chat's gate and adds the caps; a deployer's copy gets the same gate without the caps. Everyone who holds the demo's code is one shared user to the agent, and the per-cookie and per-address counts below are what keep one visitor from crowding out the others.

The gate on every copy:

- The code travels only in the body of a POST to `/api/password-auth/login`. A GET there gets 405 and sets nothing. The login route logs the status code and never the body.
- A right code sets the session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, no `Domain`, 12 hours at most. It is signed with a key made from the stored code, so changing the code signs every holder out. `POST /api/password-auth/logout` clears it.
- Without the cookie, a page request gets the gate page with status 401 and an API request gets a bare 401. The agent's own routes check the same cookie, so no chat code or agent route answers first.
- Login tries are limited before the code is compared: 10 a minute from one address and 100 a minute from everyone. The address is `x-vercel-forwarded-for` on Vercel, the last hop of `x-forwarded-for` when `AB_TRUST_PROXY` is set, and otherwise the server cannot tell callers apart, so all of them share one count. The counts live in one server instance's memory; on the demo a Vercel WAF rate-limit rule on the login path is the lasting limit.

Make the demo's code and its digest. The code is 24 random characters; the digest goes into `EVE_CHAT_PASSWORD_DIGEST` and the code itself goes only into Dominik's message to each visitor:

```bash
node -e 'console.log(require("crypto").randomBytes(18).toString("base64url"))'
node -e 'const c=require("crypto"),s=c.randomBytes(16);console.log("scrypt$"+s.toString("base64url")+"$"+c.scryptSync(process.argv[1],s,32).toString("base64url"))' '<the code>'
```

The caps on the demo, kept in an app-wide registry (`agent/lib/registry.ts`) because Eve's state belongs to one session: a private Vercel Blob document written with compare-and-set on its ETag, or a file under `.workflow-data/` off Vercel. Connect a Blob store to the demo project; Vercel sets `BLOB_READ_WRITE_TOKEN` for it.

- Tokens per session: the roster preset's budget. `agent/hooks/cap-guard.ts` cancels the turn once the session's recorded use reaches it, after pushing the branch, so the visitor never sees an offer to continue.
- Dollars per day: the AI Gateway key's daily budget. Its first 402 of the UTC day is recorded, and from then on the gate shows the resting state before any model call, until 00:00 UTC.
- Sessions: one running session per cookie and two per address. A session with no activity for 30 minutes ends.
- Session links: a session answers only the cookie that started it. The registry stores that cookie's id, and every agent route that names the session (a message, an answer, the stream, cancel, clear, compact, reset) refuses any other cookie with 403 and the message "This chat belongs to another visitor, so start a new chat to run your own." Signing in again issues a new cookie, so earlier chats stay with the old one. A deployer's copy has no registry and no such check, because one password is one user there.
- A 429 from the model provider or a sandbox that could not be created ends the run blocked, with the branch pushed and the stage named, on every copy.
- Memory (`agent/memory/ops.ts`) holds operational facts only and, on the demo, is scoped to one session, so a visitor never recalls another visitor's run.
- The chat opens with three suggested requests, each sized to reach a pull request within one session's cap; typing your own stays allowed.

The gate's states, which `apps/web/lib/gate/states.ts` holds as data and the chat and the gate pages render:

| State | Trigger | Message | Next action | Input |
|---|---|---|---|---|
| No cookie | A request for the chat without a valid session cookie. | This demo opens with a code, and the code comes in Dominik's message to you. | Enter the code, or ask Dominik for one through the contact link. | enabled |
| Wrong code | A posted code that does not match. | That code does not match the one in Dominik's message, so check it and try again. | Try again: the message shows inline and the field keeps what was typed; the contact link stays. | enabled |
| Limited | More than 10 tries in a minute from one address, or more than 100 from everyone. | There have been too many tries from here, so wait {wait} and try again. | Try again after the named wait. | disabled |
| Token cap | The session's model use reached its cap; the next model call was cancelled. | This session has used its share of the model, and its work is saved on the branch {branch} after the {stage} stage. | Open the pushed branch; there is no control to continue. | disabled |
| Resting | The AI Gateway key's daily budget answered 402 today. | The demo has used today's budget and is resting until 00:00 UTC. | Come back after 00:00 UTC. | disabled |
| Busy, this cookie | A second session under the same cookie while the first is still running. | You already have a run going in another chat, so carry on there or wait {wait} for it to end. | Open that chat, when this browser lists it; or try again after the named wait. | disabled |
| Busy, this address | A third session from one address while two are still running. | Two runs are already going from your network, so try again when one ends, within {wait}. | Try again after the named wait. | disabled |
| Blocked | The model provider answered 429, or the sandbox could not be created. | The run stopped after the {stage} stage because a service it needs is busy, and its work is saved on the branch {branch}. | Open the pushed branch. | disabled |
| Idle timeout | A session that waited 30 minutes for an answer without one. | This session ended after 30 minutes without an answer, and its work is saved on the branch {branch}. | Start again. | disabled |

{wait} is the time left before the running session ends, 30 minutes after its last activity. When this browser does not list the running chat, the busy state for this cookie says "You already have a run going in a chat this browser does not list, so wait {wait} for it to end." instead, and both forms add "A chat counts as running until it has been idle for 30 minutes."

On a deployer's copy the first two states say "This chat opens with the password the person who deployed it chose." and "That password does not match, so check it and try again." and offer no contact link.

## Demo

Dominik's demo instance is this folder deployed as a second Vercel project, with the gate and caps above, working on one public sample repository. The steps that create it and the checks run against it after each deploy are in the product's `RUNBOOK.md`, under "Demo instance".

The demo sets these variables, all scoped to Production:

- `AB_DEMO=1`, which turns on the caps, the demo's pull request template and the cleanup schedule (hourly).
- `EVE_CHAT_PASSWORD_DIGEST`, the digest of the shared code (the one-liners are under [Demo gate](#demo-gate)); `EVE_CHAT_PASSWORD` stays unset.
- `AB_GITHUB_APP_ID` and `AB_GITHUB_APP_PRIVATE_KEY` for the demo's own GitHub App, installed on the sample repository only.
- `AI_GATEWAY_API_KEY`, a key with a daily budget, instead of the project's OIDC token, so the budget's 402 can rest the demo.
- `AB_DEMO_REPOSITORY`, the sample repository, which the agent clones for every request without asking; unset, it is `Ninety2UA/agent-blueprint-sample`.
- `AB_CLEANUP_DRY_RUN`, set only while checking what the cleanup would do.
- `BLOB_READ_WRITE_TOKEN`, which Vercel sets when a Blob store is connected; the registry needs it.

The cleanup (`agent/schedules/demo-cleanup.ts`, rules in `agent/lib/demo-cleanup.ts`) runs at minute 0 of every hour (`0 * * * *`), a Vercel Cron Job. Vercel Hobby allows a cron job at most once a day, so on Hobby set the schedule to daily before deploying. It runs under the App's token, with no model call:

- It closes open pull requests older than 24 hours whose head is an `ab/` branch of the sample repository.
- It deletes `ab/` branches whose tip is older than 7 days and whose session the registry marks ended.
- It never touches `main`, a branch outside `ab/`, or the branch of a running session, whether live or parked inside the 30-minute idle timeout. A branch the registry does not name stays, and the log says so.
- It does nothing on a copy without `AB_DEMO=1`, and nothing while `AB_MAINTENANCE` is set.

To see what a run would do, set `AB_CLEANUP_DRY_RUN=1`, redeploy, and press **Run** on the job under **Settings**, **Cron Jobs** in the Vercel project; the log lists each pull request it would close and each branch it would delete. Remove the variable and redeploy to let it act. Under `eve dev` the same run is `curl -X POST http://localhost:2000/eve/v1/dev/schedules/demo-cleanup`.

## Upgrade

Move a copy to a new release from your own clone of the repository. A session can only continue on the Eve version that started it, so on Railway and your own server an upgrade that changes Eve's version strands every session still open; on Vercel each run stays on the deployment that started it. The steps below end the open sessions first, with their work on their branches.

A service the Railway button made builds from this repository, so eject it first (see [Railway](#railway)) and run the steps below from the new repository. Applying Railway's update notice instead skips them.

1. **Merge the release.** In your clone:

   ```bash
   git remote add upstream https://github.com/Ninety2UA/agent-blueprint.git   # once
   git fetch upstream --tags
   git merge v<new version>
   ```

   A copy the Vercel button made starts from its own first commit, and a repository Railway's Eject made may too, so git refuses with "refusing to merge unrelated histories". Merge that first time with `git merge --allow-unrelated-histories v<new version>` and resolve each conflict. Compare `"eve"` in `eve/package.json` before and after: a changed version is what strands sessions off Vercel.
2. **Set the maintenance variable.** Set `AB_MAINTENANCE=1` on the running copy, still at the old release. While it is set, a new chat, an HTTP trigger, a Slack mention or direct message, a Linear delegation or reply, a Telegram message, an MCP `agent_start` or `agent_update`, and an answer to a checkpoint question get "This agent is being upgraded and is not starting new work right now, so try again a little later." and start nothing; the health route, streams, cancel and reset still answer. Linear shows the message as an error activity, Telegram as a reply or, for a button press, an alert that leaves the question open, and an MCP client as a tool error; a Linear **Stop**, `agent_get` and `agent_cancel` still work. On Vercel, `npx vercel@65.3.1 env add AB_MAINTENANCE production`, then `npx vercel@65.3.1 redeploy <current production URL>` so the running release reads it. On Railway, add the variable to the agent service and deploy the change. On your own server, restart the process with the variable set. This agent has no schedules; a schedule you add starts its sessions without the route check, so have it return early while `AB_MAINTENANCE` is set.
3. **List the open sessions.** On Vercel, open the project's **Observability**, **Agent Runs** and look for runs still running. On your own server, in `eve/`:

   ```bash
   node -e 'const fs=require("fs"),d=".eve/.workflow-data/runs";for(const f of fs.readdirSync(d)){const r=JSON.parse(fs.readFileSync(d+"/"+f,"utf8"));if(r.workflowName==="workflow//eve//workflowEntry"&&r.status==="running")console.log(r.runId,r.updatedAt)}'
   ```

   On Railway, list the sessions the Postgres world holds as running.
4. **Stop while any session is open.** Go on only when the list is empty. For each open session, check that its branch on GitHub holds the last stage it finished (each stage push is a commit with an `Agent-Blueprint-Stage` trailer), wait for a turn that is still working to settle or cancel it, then end the session:

   ```bash
   curl -X POST "https://<your-deployment>/eve/v1/session/<session id>/reset" \
     -H "Authorization: Bearer $VERCEL_OIDC_TOKEN" \
     -H "Content-Type: application/json" -d '{"reason":"upgrade"}'
   ```

   Off Vercel there is no OIDC token; send the web chat's cookie instead, made from your `EVE_CHAT_PASSWORD` in `eve/` with `node -e 'import("./apps/web/lib/gate/code.ts").then(m=>console.log(m.issueCookie(process.argv[1]).value))' "$EVE_CHAT_PASSWORD"` and passed as `-H "Cookie: eve_chat_session=<value>"`. Keep `EVE_CHAT_PASSWORD` set off Vercel even on a copy you reach only through Slack, Linear, Telegram or MCP, because it is the credential that ends sessions there. List again until nothing is open.
5. **Back up the run store.** On Railway, before the new release's bootstrap migrates the database (its migrations have no down step): `pg_dump "$WORKFLOW_POSTGRES_URL" -Fc -f agent-blueprint-before-v<new version>.dump`. On your own server, stop the process and copy the folder: `tar czf agent-blueprint-before-v<new version>.tgz .eve/.workflow-data`. On Vercel the workflow store is Vercel's and needs no backup.
6. **Deploy.** Push the merged branch, or run the route's deploy command: `npm run deploy` on Vercel; on Railway the push builds the image and the pre-deploy command runs the bootstrap; on your own server `npm ci`, `npm run build` and start the process again, still with `AB_MAINTENANCE` set.
7. **Validate.** `curl https://<your-deployment>/eve/v1/health` must answer ready. Then run the discovery and resume evals against the deployment from `eve/` in your clone: `AB_EVAL_MOCK=1 npx eve@<new eve version> eval discovery resume --url https://<your-deployment>`.
8. **Roll back if validation fails.** Return the clone to the previous release (`git revert -m 1 <merge commit>`), restore the backup (Railway: `pg_restore --clean -d "$WORKFLOW_POSTGRES_URL" agent-blueprint-before-v<new version>.dump`; your own server: stop the process and unpack the folder you saved) and deploy the previous release. On Vercel, `npx vercel@65.3.1 rollback <previous production URL>` puts the previous deployment back at once.
9. **Clear the maintenance variable** once validation passed or the rollback is complete: on Vercel `npx vercel@65.3.1 env rm AB_MAINTENANCE production` and redeploy; on Railway delete the variable and deploy; on your own server restart without it.

### Rotate a channel's secret

Each new value takes effect at the next deploy, or the next start on your own server.

- `LINEAR_CLIENT_SECRET`: rotating it revokes every token the agent holds, and on Vercel a run keeps the variables of the deployment that started it. So set `AB_MAINTENANCE` (step 2 above) and wait until no Linear run is working (step 3 lists them). Then rotate the secret on the Linear app's page, set the new value, deploy, and clear `AB_MAINTENANCE`.
- `LINEAR_WEBHOOK_SECRET`: if you change the webhook's signing secret on the app's page, set the new value and deploy. A Linear delivery signed with the other secret gets 401 until both sides match.
- `TELEGRAM_BOT_TOKEN`: revoke the token in @BotFather, which issues a new one, set it and deploy, then run step 1 of Telegram under [After the deploy](#after-the-deploy) again with the new token.
- `TELEGRAM_WEBHOOK_SECRET_TOKEN`: make a new one with `openssl rand -hex 32`, set it and deploy, then run that step 1 again with the new secret. Updates sent in between get 401 until the two match.
- `AB_MCP_TOKEN`: set the old and the new value separated by a comma and deploy, move every client to the new value, then set the new value alone and deploy again.

### Rotate the workflow secret

`AB_WORKFLOW_SECRET` applies only where the workflow store is Postgres. Make a new value with `openssl rand -hex 32`, set it on every deployment that shares the database, and redeploy each one; until they all have it, they refuse each other's messages. Messages queued before the change carry a signature made with the old value, so the queue route refuses them with 401, and each refusal writes a `Failed task` line to the log. No run is lost. A deployment that starts queues a new wake, signed with the new value, for every run still in progress; each run continues from there and queues its pending waits again, which replaces the refused copies. A refused message nothing replaces is tried again up to 73 times, the later attempts about six hours apart, for about 16 days.

### Remove a channel

Stop the platform's deliveries first, then remove the variables and deploy. Without its variables a channel starts nothing.

- Linear: turn off the app's webhooks on its page, or delete the app, then remove `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET` and `LINEAR_WEBHOOK_SECRET`.
- Telegram: run `curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"`, then remove `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET_TOKEN` and `AB_TELEGRAM_USERS`. Send `/deletebot` to @BotFather if you no longer need the bot.
- MCP: remove the server from each client (`claude mcp remove agent-blueprint` in Claude Code, the connector in Claude.ai and ChatGPT), then remove `AB_MCP_TOKEN` and the three `AB_MCP_OAUTH_*` variables. The OAuth variables are read at build, so off Vercel rebuild without them.

## Develop

Node 24 or later. Run these in `eve/`:

```bash
npm ci
npx eve@0.86.0 info                       # what Eve discovered
npm run build
AB_EVAL_MOCK=1 npx eve@0.86.0 eval --tag mock   # the mocked evals: no model calls, no key
npm test                                  # the Daytona provider, credentials, publish tool, ship loop, helper, registry, gate and demo cleanup, with stubs; needs git
```

The smoke record's Eve rows come from `eve eval`: the mock-tagged evals on every pull request, the live-tagged cells (`canary`, `build`, `review` on local Docker, `ship` with `--url` against the demo) once per release with approved spend; `python3 eve/scripts/smoke-to-json.py` turns the `--json` output into the rows (see `tests/smoke/README.md`).

Local builds and evals start Docker sandboxes, so Docker must be able to mount this folder.
