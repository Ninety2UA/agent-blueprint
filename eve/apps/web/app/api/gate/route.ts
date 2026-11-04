import { connection } from "next/server";
import { defaultRegistry } from "../../../../../agent/lib/registry";
import { gateStatus } from "@/lib/gate/status";

// GET /api/gate?session=<id>: the gate state the chat should show, if any (demo only). Read at
// request time: the answer depends on the caller's cookie and the registry, never on the build.
export async function GET(request: Request) {
  await connection();
  const status = await gateStatus(request, process.env.AB_DEMO === "1" ? defaultRegistry() : null);
  return Response.json(status, { headers: { "cache-control": "no-store" } });
}
