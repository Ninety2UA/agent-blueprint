import { defineDynamic, defineInstructions } from "eve/instructions";
import { demoInstructionsFor } from "../lib/demo-repository";

// On the demo (AB_DEMO=1) only: the root is told every request is about AB_DEMO_REPOSITORY, which
// it clones without asking; every session, a helper's root copy included, is told to leave
// BACKLOG.md alone and return follow-ups instead (ruling 78, review #6). Read at run time before
// each model call, so the deploy's variables decide, not the build's; it joins instructions.md as
// system text. Off the demo it returns null and adds nothing.
export default defineDynamic((ctx) => {
  const content = demoInstructionsFor(ctx.session);
  return content ? defineInstructions({ content }) : null;
});
