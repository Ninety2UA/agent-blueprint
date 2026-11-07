// The deploy variables. The table under "Variables" in eve/README.md is the source;
// evals/env-table.eval.ts fails when this list and the table differ.
//
// `prompts` lists the configurator choices that make a deploy link ask for the variable:
// `always`, `never`, or `<choice>=<value>` for host, gateway, sandbox, channel and preset
// (gateway is `oidc`, the Vercel project's own token, or `key`, an AI Gateway API key).
// `default` is the value used when nothing is set; `{preset}` and `{sandbox}` are the
// configurator's preset and sandbox choices. A sensitive variable never has a default.

export interface DeployVariable {
  readonly name: string;
  readonly description: string;
  readonly link: string;
  readonly prompts: readonly string[];
  readonly sensitive: boolean;
  readonly default: string | null;
}

export const VARIABLES: readonly DeployVariable[] = [
  {
    name: "AB_ROSTER",
    description: "The roster preset, quality or budget, which sets the model and reasoning level of every role.",
    link: "#roster",
    prompts: ["always"],
    sensitive: false,
    default: "{preset}",
  },
  {
    name: "AB_MODEL_<ROLE>",
    description: "Replaces one role's AI Gateway model id, for example AB_MODEL_REVIEWER. Roles: lead, planner, builder, reviewer, tester, analyst, documenter.",
    link: "#roster",
    prompts: ["never"],
    sensitive: false,
    default: null,
  },
  {
    name: "AB_REASONING_<ROLE>",
    description: "Replaces one role's reasoning level, for example AB_REASONING_TESTER=medium.",
    link: "#roster",
    prompts: ["never"],
    sensitive: false,
    default: null,
  },
  {
    name: "AI_GATEWAY_API_KEY",
    description: "An AI Gateway API key. On Vercel you can leave it out: the project's own OIDC token reaches the Gateway.",
    link: "https://vercel.com/docs/ai-gateway/authentication",
    prompts: ["gateway=key"],
    sensitive: true,
    default: null,
  },
  {
    name: "AB_GITHUB_APP_ID",
    description: "The id of the GitHub App you created for this copy.",
    link: "#pre-flight",
    prompts: ["always"],
    sensitive: true,
    default: null,
  },
  {
    name: "AB_GITHUB_APP_PRIVATE_KEY",
    description: "The private key of that GitHub App, the whole PEM file.",
    link: "#pre-flight",
    prompts: ["always"],
    sensitive: true,
    default: null,
  },
  {
    name: "EVE_CHAT_PASSWORD",
    description: "The password the web chat asks for before it opens.",
    link: "#pre-flight",
    prompts: ["channel=web"],
    sensitive: true,
    default: null,
  },
  {
    name: "EVE_CHAT_PASSWORD_DIGEST",
    description: "The salted digest form of the web chat's code, used instead of EVE_CHAT_PASSWORD; the demo sets it. Make it with the one-liner under Demo gate.",
    link: "#demo-gate",
    prompts: ["never"],
    sensitive: true,
    default: null,
  },
  {
    name: "AB_TRUST_PROXY",
    description: "Set it to 1 when a proxy that writes the x-forwarded headers sits in front of the web chat or the agent off Vercel, such as Railway's edge or your own nginx. Each reader takes the last value, the one that proxy wrote. The login limiter keys on x-forwarded-for, the Linear install takes its host from x-forwarded-host, and MCP takes the scheme and host from x-forwarded-proto and x-forwarded-host, so it answers behind a proxy that ends TLS. Leave it unset when callers can reach the server without the proxy. The Railway template sets it.",
    link: "#your-own-server",
    prompts: ["never"],
    sensitive: false,
    default: null,
  },
  {
    name: "SLACK_BOT_TOKEN",
    description: "The bot token of your Slack app.",
    link: "https://eve.dev/docs/channels/slack",
    prompts: ["channel=slack"],
    sensitive: true,
    default: null,
  },
  {
    name: "SLACK_SIGNING_SECRET",
    description: "The signing secret of your Slack app.",
    link: "https://eve.dev/docs/channels/slack",
    prompts: ["channel=slack"],
    sensitive: true,
    default: null,
  },
  {
    name: "LINEAR_CLIENT_ID",
    description: "The client ID of the Linear app you create for this copy, with client credentials turned on and installed with actor=app.",
    link: "#after-the-deploy",
    prompts: ["channel=linear"],
    sensitive: false,
    default: null,
  },
  {
    name: "LINEAR_CLIENT_SECRET",
    description: "The client secret of that Linear app. The agent mints its own 30-day token from the ID and secret and renews it before it expires.",
    link: "#after-the-deploy",
    prompts: ["channel=linear"],
    sensitive: true,
    default: null,
  },
  {
    name: "LINEAR_WEBHOOK_SECRET",
    description: "The signing secret Linear shows for your app's webhook; the agent refuses any Linear request not signed with it.",
    link: "#after-the-deploy",
    prompts: ["channel=linear"],
    sensitive: true,
    default: null,
  },
  {
    name: "TELEGRAM_BOT_TOKEN",
    description: "The token @BotFather sends when you create your bot with /newbot.",
    link: "#after-the-deploy",
    prompts: ["channel=telegram"],
    sensitive: true,
    default: null,
  },
  {
    name: "TELEGRAM_WEBHOOK_SECRET_TOKEN",
    description: "A secret you make with openssl rand -hex 32 and pass to setWebhook as secret_token; Telegram sends it back with every update. It needs 32 characters or more, and Telegram rejects base64 output.",
    link: "#after-the-deploy",
    prompts: ["channel=telegram"],
    sensitive: true,
    default: null,
  },
  {
    name: "AB_TELEGRAM_USERS",
    description: "The numeric Telegram user ids allowed to use the bot, separated by commas. Empty, it admits nobody; anyone not listed gets one reply an hour with their own id.",
    link: "#after-the-deploy",
    prompts: ["channel=telegram"],
    sensitive: false,
    default: null,
  },
  {
    name: "AB_SANDBOX",
    description: "Where the agent's shell runs: vercel, docker or daytona. Unset, it is vercel on Vercel and docker elsewhere.",
    link: "#sandbox",
    prompts: ["sandbox=daytona"],
    sensitive: false,
    default: "{sandbox}",
  },
  {
    name: "AB_ALLOWED_HOSTS",
    description: "Hosts the sandbox may reach besides GitHub, separated by commas. Docker cannot list hosts: there any value allows every host and an empty value blocks all.",
    link: "#sandbox",
    prompts: ["never"],
    sensitive: false,
    default: "registry.npmjs.org,pypi.org,files.pythonhosted.org",
  },
  {
    name: "DAYTONA_API_KEY",
    description: "Your Daytona API key. The build needs it too, because it prepares the Daytona sandbox.",
    link: "#pre-flight",
    prompts: ["sandbox=daytona"],
    sensitive: true,
    default: null,
  },
  {
    name: "AB_WORKFLOW_SECRET",
    description:
      "The key the agent signs every message it queues in Postgres with; the queue route /.well-known/workflow/v1/flow refuses any request without a valid signature. Set it when the build sets WORKFLOW_TARGET_WORLD=@workflow/world-postgres; the agent does not start without it. It needs 32 characters or more (openssl rand -hex 32), no space or line break at either end, and the same value on every deployment that shares the database. The Railway template generates it.",
    link: "#railway",
    prompts: ["never"],
    sensitive: true,
    default: null,
  },
  {
    name: "AB_MAINTENANCE",
    description: "Set it to any value while you upgrade: new sessions and answers to checkpoint questions get a maintenance message instead of starting work. Clear it when the upgrade is done.",
    link: "#upgrade",
    prompts: ["never"],
    sensitive: false,
    default: null,
  },
  {
    name: "AB_DEMO",
    description: "Set on Dominik's demo instance only; tightens the write policy and the caps.",
    link: "#variables",
    prompts: ["never"],
    sensitive: false,
    default: null,
  },
  {
    name: "AB_DEMO_REPOSITORY",
    description: "The demo's sample repository, as owner/name, which every demo request and the demo's cleanup work on.",
    link: "#demo",
    prompts: ["never"],
    sensitive: false,
    default: "Ninety2UA/agent-blueprint-sample",
  },
  {
    name: "AB_CLEANUP_DRY_RUN",
    description: "Set it to any value and the demo's cleanup logs what it would close and delete and changes nothing.",
    link: "#demo",
    prompts: ["never"],
    sensitive: false,
    default: null,
  },
  {
    name: "AB_MCP_TOKEN",
    description:
      "The bearer token an MCP client such as Claude Code sends. Make it with openssl rand -hex 32; a value under 32 characters counts as unset. During a rotation, set the old and new values separated by a comma.",
    link: "#after-the-deploy",
    prompts: ["channel=mcp"],
    sensitive: true,
    default: null,
  },
  {
    name: "AB_MCP_OAUTH_ISSUER",
    description:
      "The issuer URL of the identity provider that signs people in from Claude.ai and ChatGPT, such as your WorkOS AuthKit domain. It must be an https URL. Set it for the build and at run time; a change needs a new build.",
    link: "#web-chat-and-channels",
    prompts: ["never"],
    sensitive: false,
    default: null,
  },
  {
    name: "AB_MCP_OAUTH_SUBJECTS",
    description:
      "The user ids (the provider's sub claim) allowed to use the agent over MCP, separated by commas; a single * admits everyone the provider signs in. Set it for the build and at run time; a change needs a new build.",
    link: "#web-chat-and-channels",
    prompts: ["never"],
    sensitive: false,
    default: null,
  },
  {
    name: "AB_MCP_OAUTH_RESOURCE",
    description:
      "The MCP address people type into their client, such as agent.example.com/eve/v1/mcp. Unset on Vercel, it is the production address followed by /eve/v1/mcp. Set it for the build and at run time; a change needs a new build.",
    link: "#web-chat-and-channels",
    prompts: ["never"],
    sensitive: false,
    default: null,
  },
];

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function unquote(cell: string): string {
  return cell.replace(/^`(.*)`$/, "$1");
}

/** Reads the table under the README's "## Variables" heading. */
export function parseVariableTable(readme: string): DeployVariable[] {
  const lines = readme.split("\n");
  const start = lines.findIndex((line) => line.trim() === "## Variables");
  if (start < 0) throw new Error('README.md has no "## Variables" section');
  const table: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim().startsWith("|")) table.push(line);
    else if (table.length) break;
  }
  const [header, separator, ...rows] = table;
  const expected = ["Name", "Description", "Link", "Prompted when", "Sensitive", "Default"];
  if (!header || cells(header).join("|") !== expected.join("|") || !separator) {
    throw new Error(`the Variables table must have the columns ${expected.join(", ")}`);
  }
  return rows.map((row) => {
    const values = cells(row);
    if (values.length !== expected.length) throw new Error(`variable row has ${values.length} cells: ${row}`);
    const [name, description, link, prompts, sensitive, fallback] = values;
    if (sensitive !== "yes" && sensitive !== "no") throw new Error(`${name}: Sensitive must be yes or no`);
    const target = /^\[[^\]]+\]\(([^)]+)\)$/.exec(link)?.[1];
    if (!target) throw new Error(`${name}: Link must be one markdown link`);
    return {
      name: unquote(name),
      description,
      link: target,
      prompts: prompts.split(",").map((token) => unquote(token.trim())),
      sensitive: sensitive === "yes",
      default: fallback === "none" ? null : unquote(fallback),
    };
  });
}
