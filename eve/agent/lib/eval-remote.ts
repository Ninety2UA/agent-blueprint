// Where publish_branch and the cap hook push during an eval. Both substitute the same stand-in:
// a placeholder token and a bare repository inside the sandbox at /tmp/ab-eval-remote/<owner>--<repo>.git,
// instead of an App token and github.com.
//   "mock"     AB_EVAL_MOCK=1, the scripted mock's evals (unchanged)
//   "sandbox"  AB_EVAL_REMOTE=sandbox, a live-model cell in a local eve eval (ruling 50(b)), so a stage
//              push really lands and the cell can see it
//   null       every real run: the App token and github.com
// AB_EVAL_REMOTE is eval-only and never documented as a deploy variable. It is refused, with a throw
// and never a silent fall back to GitHub, on the demo, on Vercel, and outside a local eve eval
// (eve eval sets EVE_EVALUATION=1 in its own process before it starts the local server).

export type EvalRemote = "mock" | "sandbox" | null;

export const EVAL_REMOTE_ROOT = "/tmp/ab-eval-remote";

export function evalRemote(env: Record<string, string | undefined> = process.env): EvalRemote {
  if (env.AB_EVAL_MOCK === "1") return "mock";
  const value = env.AB_EVAL_REMOTE?.trim();
  if (!value) return null;
  const refused = (why: string) =>
    new Error(`AB_EVAL_REMOTE=${value} is refused: ${why}. It is for local eve evals only; unset it. Nothing was pushed.`);
  if (value !== "sandbox") throw refused('the only value is "sandbox"');
  if (env.AB_DEMO === "1") throw refused("this is the demo (AB_DEMO=1)");
  if (env.VERCEL) throw refused("this runs on Vercel (VERCEL is set)");
  if (env.EVE_EVALUATION !== "1") throw refused("this is not a local eve eval (EVE_EVALUATION is not 1)");
  return "sandbox";
}

/**
 * The stand-in for GitHub's pull request REST calls in an eval, held in this process: list the open
 * pull requests by head, open one, update its body, label it. Under AB_EVAL_MOCK=1 an approved
 * pull-request call used to reach api.github.com with the placeholder token; this answers instead.
 * One stand-in per process, so a second call in a run finds the pull request the first one opened.
 */
export function evalGitHubApi(): typeof fetch {
  githubStandIn ??= gitHubStandIn();
  return githubStandIn;
}

let githubStandIn: typeof fetch | null = null;

function gitHubStandIn(): typeof fetch {
  const pulls: { repository: string; number: number; head: string; draft: boolean; title: string; body: string }[] = [];
  const json = (value: unknown, status = 200) => Response.json(value, { status });
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const match = /^\/repos\/([^/]+\/[^/]+)(\/.*)?$/.exec(url.pathname);
    if (!match) return json({ message: "Not Found" }, 404);
    const [, repository, rest = ""] = match;
    const owner = repository.split("/")[0];
    if (method === "GET" && rest === "") return json({ default_branch: "main" });
    if (method === "GET" && rest === "/pulls") {
      const head = url.searchParams.get("head");
      return json(pulls.filter((pull) => pull.repository === repository && `${owner}:${pull.head}` === head).map((pull) => ({ ...pull, html_url: `https://github.com/${repository}/pull/${pull.number}` })));
    }
    if (method === "POST" && rest === "/pulls") {
      const pull = { repository, number: pulls.filter((each) => each.repository === repository).length + 1, head: String(body.head), draft: body.draft === true, title: String(body.title), body: String(body.body) };
      pulls.push(pull);
      return json({ ...pull, html_url: `https://github.com/${repository}/pull/${pull.number}` }, 201);
    }
    const patched = /^\/pulls\/(\d+)$/.exec(rest);
    const pull = patched ? pulls.find((each) => each.repository === repository && each.number === Number(patched[1])) : undefined;
    if (method === "PATCH" && pull) {
      pull.body = String(body.body ?? pull.body);
      return json({ ...pull, html_url: `https://github.com/${repository}/pull/${pull.number}` });
    }
    if (method === "POST" && /^\/issues\/\d+\/labels$/.test(rest)) return json([]);
    return json({ message: "Not Found" }, 404);
  }) as typeof fetch;
}

/** The stand-in remote for a repository named owner/repo. */
export function evalRemoteUrl(repository: string): string {
  return `file://${EVAL_REMOTE_ROOT}/${repository.replace("/", "--")}.git`;
}
