import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { SMOKE, answerCheckpoints, skipLive } from "./fixture/smoke-cell";

// Live smoke cell (KTD15): the end-to-end run against the demo's production deployment, the one
// deployment that proves brokering and the GitHub-only policy on Vercel Sandbox. It runs only with
// --url, on the repository named by AB_SMOKE_SHIP_REPOSITORY (a github.com URL the demo's App can
// publish to), sends the ship cell's feature request through ab-ship-pipeline, approves every
// checkpoint and passes when the run reaches the publish call and opens a pull request.
const SKILL = "ab-ship-pipeline";
const REPOSITORY = process.env.AB_SMOKE_SHIP_REPOSITORY?.trim() ?? "";
// The live cell's own request, written for the tally sample the demo works on (ruling 96). feature.txt
// beside it belongs to the CLI smoke cells, whose fixture is a notes app the sample does not hold.
const FEATURE = readFileSync(join(SMOKE, "scenarios", "ship", "feature-live.txt"), "utf8").trim();
const COMMAND = "AB_SMOKE_SHIP_REPOSITORY=<github.com URL> npx eve eval ship --url <demo production URL>";

export default defineEval({
  description: "Ship: ab-ship-pipeline on the demo takes the feature request to a published pull request.",
  tags: ["live"],
  timeoutMs: 7_200_000,
  async test(t) {
    if (skipLive(t, "remote", COMMAND)) return;
    if (!REPOSITORY) {
      t.skip(`AB_SMOKE_SHIP_REPOSITORY names the repository the ship cell publishes to: ${COMMAND}`);
      return;
    }
    const session = await t.session();
    const { turn } = await answerCheckpoints(await session.send(`Use the ${SKILL} skill. Work on ${REPOSITORY}: ${FEATURE}`));

    // Eve runs the pipeline through the ship_pipeline tool, which checks the run's provenance names
    // ab-ship-pipeline at the deployed version; the skill itself is not loaded (ruling 97).
    t.calledTool("ship_pipeline");
    t.calledTool("publish_branch", { input: { mode: "pull-request" } });
    t.check(turn.reply ?? "", includes(/https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/)).label("the reply links the pull request");
    t.succeeded();
  },
});
