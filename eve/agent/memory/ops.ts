import { defineMemory } from "eve/memory";
import { fileMemory } from "eve/memory/file";
import { byPrincipal } from "eve/memory/scope";

// Operational memory (KTD10): the last run, its branch, its pull request and the roster it ran
// on, recalled before each turn, capped at 4,000 characters. Project knowledge stays in the
// repository through the skills, never here.
//   scope     per session on the demo (AB_DEMO=1), so one visitor never recalls another's run;
//             per principal elsewhere, Eve's byPrincipal
//   backend   Eve's choice: private Vercel Blob on Vercel once a store is connected, process
//             memory under eve dev; off Vercel, and on Vercel without a store, the slot is off
// The resume path reads the run's durable record only (lib/run-state.ts), so a missing store
// changes nothing about a resume.

function hasBlobStore(env: NodeJS.ProcessEnv = process.env): boolean {
  return ["EVE_MEMORY_BLOB_STORE_ID", "EVE_MEMORY_BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "BLOB_READ_WRITE_TOKEN"].some((key) => env[key]?.trim());
}

export default defineMemory({
  description:
    "Operational facts about this agent's runs only: the last run's request, its branch, its pull request link and the roster it ran on. Never project knowledge, which belongs in the repository.",
  provider: fileMemory({ maxCharacters: 4_000 }),
  scope(ctx) {
    if (process.env.VERCEL ? !hasBlobStore() : process.env.EVE_DEV !== "1") return null;
    if (process.env.AB_DEMO === "1") return ["session", ctx.session.id];
    return byPrincipal(ctx);
  },
});
