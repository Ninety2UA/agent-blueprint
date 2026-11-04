import { basename, dirname } from "node:path";
import { withEve } from "eve/vercel";

// Vercel evaluates a compiled copy of this file from eve/.vercel/ with the product folder
// (the upload root) as the working directory, so the eve root is named here.
const here = import.meta.dirname;
const root = basename(here) === ".vercel" ? dirname(here) : here;

// The agent's own service and its /eve/v1 routes, and the chat UI as a web service at apps/web,
// as Eve's chat template deploys it: every other path goes to the web app, whose proxy is the gate.
const config = await withEve(
  {
    services: {
      web: { framework: "nextjs", root: "apps/web", buildCommand: "node ../../node_modules/next/dist/bin/next build" },
    },
    routes: [{ src: "^(.*)$", destination: { type: "service", service: "web" } }],
  },
  { root },
);
const eve = config.services.eve;
if (!eve?.buildCommand) throw new Error("withEve generated no eve service build command");

// The skill count gate runs before every Vercel build of the agent service.
export default {
  ...config,
  services: {
    ...config.services,
    eve: { ...eve, buildCommand: `node ../../../scripts/check-skill-count.mjs && ${eve.buildCommand}` },
  },
};
