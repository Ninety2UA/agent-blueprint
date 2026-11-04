import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { parseAllowedHosts } from "../agent/lib/credentials";
import { VARIABLES } from "../agent/lib/env";

// The sandbox's tools and network policy, for whichever provider and allowed hosts the run
// uses, so one eval covers the matrix: run it again with AB_ALLOWED_HOSTS= (empty) for the
// closed cells, and with AB_SANDBOX=vercel or daytona for those providers.
const PROVIDER = process.env.AB_SANDBOX?.trim() || (process.env.VERCEL ? "vercel" : "docker");
const HOSTS = parseAllowedHosts(
  process.env.AB_ALLOWED_HOSTS,
  VARIABLES.find((variable) => variable.name === "AB_ALLOWED_HOSTS")?.default ?? "",
);
const REPOSITORY = "https://github.com/Ninety2UA/agent-blueprint";

// Docker opens everything for any allowed host and closes everything for none. Vercel and
// Daytona allow the GitHub pair and the listed hosts only. Daytona tiers 1 and 2 keep the
// organisation's policy, which lets the registries through even with an empty list, so the
// eval does not assert a blocked registry there.
const open = PROVIDER === "docker" ? HOSTS.length > 0 : true;
const outside = PROVIDER === "docker" ? HOSTS.length > 0 : false;
const registry = PROVIDER === "docker" ? HOSTS.length > 0 : HOSTS.includes("registry.npmjs.org");
const checkRegistry = !(PROVIDER === "daytona" && !registry);

export default defineEval({
  description: "The sandbox has git, gh and python3, reaches only what its network policy allows, and holds no GitHub token.",
  tags: ["mock"],
  async test(t) {
    if (process.env.AB_EVAL_MOCK !== "1") throw new Error("mock-tagged evals need AB_EVAL_MOCK=1");
    const first = await t.send(
      [
        "bash: git --version && gh --version && python3 --version",
        "bash: curl -fsS -o /dev/null --max-time 15 https://example.com && echo 'outside ok' || echo 'outside blocked'",
        "bash: cd \"$(mktemp -d)\" && timeout 25 npm install --no-audit --no-fund --silent --fetch-retries=0 --fetch-timeout=10000 is-number@7.0.0 && echo 'registry ok' || echo 'registry blocked'",
        `bash: git ls-remote ${REPOSITORY} HEAD > /dev/null && echo 'github ok' || echo 'github blocked'`,
        "bash: env | grep -ciE '^(GH_TOKEN|GITHUB_TOKEN|AB_GITHUB_[A-Z_]*)=|ghs_' || true",
      ].join("\n"),
    );
    first.calledTool("bash", { input: { command: /gh --version/ }, output: /git version[\s\S]*gh version[\s\S]*Python 3/ });
    first.calledTool("bash", { input: { command: /example\.com/ }, output: outside ? /outside ok/ : /outside blocked/ });
    if (checkRegistry) {
      first.calledTool("bash", { input: { command: /npm install/ }, output: registry ? /registry ok/ : /registry blocked/ });
    }
    first.calledTool("bash", { input: { command: /ls-remote/ }, output: open ? /github ok/ : /github blocked/ });
    first.calledTool("bash", { input: { command: /grep -ciE/ }, output: /"stdout":"0\\n"/ });

    const second = await first.session.send([`clone: ${REPOSITORY}`, "bash: git config --get-regexp '^remote\\.'"].join("\n"));
    if (open) {
      second.calledTool("clone_repository", { output: { action: "cloned", access: "public" } });
      second.calledTool("bash", { output: (value) => /agent-blueprint\.git/.test(JSON.stringify(value)) && !/@/.test(JSON.stringify(value)) });
    } else {
      // A closed network is a failed tool call the agent can report, not a stall.
      second.calledTool("clone_repository", { status: "failed" });
      t.check(second.reply, includes("fetching https://github.com/ninety2ua/agent-blueprint failed"));
    }
    t.succeeded();
  },
});
